/**
 * A shared, persistent cache of the portal's stable reference data — the
 * district → taluka → village tree, plus per-record-type search sub-types,
 * languages and KJP classification lists.
 *
 * None of this changes between requests, so it is fetched once (lazily, via a
 * throwaway {@link MahabhulekhClient}), kept in memory across requests, and
 * mirrored to disk so it survives restarts. Dropdowns read from here and never
 * touch the stateful search session, which is what keeps navigation instant.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { unstable_cache } from "next/cache";
import { join } from "node:path";
import type { Option, RecordType } from "@bhumi/core";
import { MahabhulekhClient } from "@bhumi/core/server";
import type { VillageContext } from "@bhumi/core";

interface TreeCache {
  districts: Partial<Record<RecordType, Option[]>>;
  talukas: Record<string, Option[]>; // key: `${rt}|${district}`
  villages: Record<string, Option[]>; // key: `${rt}|${district}|${taluka}`
  context: Record<string, VillageContext>; // key: `${rt}|${district}|${taluka}|${village}`
  nameTypes: Partial<Record<RecordType, Option[]>>;
}

/**
 * Bump when the shape or the cleaning of cached options changes, so a tree
 * written by an older build (placeholder rows, untrimmed values) is discarded
 * rather than served.
 */
const CACHE_VERSION = 2;

/**
 * Where the tree is mirrored. Serverless hosts only allow writes to the temp
 * directory, so that is the fallback outside a long-lived server; set
 * `BHUMI_CACHE_DIR` to put it somewhere durable.
 */
const CACHE_DIR =
  process.env.BHUMI_CACHE_DIR ??
  (process.env.VERCEL ? join(tmpdir(), "bhumi") : join(process.cwd(), ".cache"));
const CACHE_FILE = join(CACHE_DIR, "tree.json");

const g = globalThis as Record<string, unknown>;
const cache: TreeCache = (g.__bhumiTree as TreeCache) ??
  (g.__bhumiTree = { districts: {}, talukas: {}, villages: {}, context: {}, nameTypes: {} });

// In-flight populators, so concurrent requests for the same key share one fetch.
const inflight = (g.__bhumiInflight as Map<string, Promise<unknown>>) ??
  (g.__bhumiInflight = new Map<string, Promise<unknown>>());

let loaded = false;
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const { version, ...disk } = JSON.parse(await readFile(CACHE_FILE, "utf8")) as TreeCache & {
      version?: number;
    };
    if (version === CACHE_VERSION) Object.assign(cache, disk);
  } catch {
    /* first run — no cache file yet */
  }
}

let persistTimer: NodeJS.Timeout | null = null;
function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void mkdir(CACHE_DIR, { recursive: true })
      .then(() => writeFile(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, ...cache })))
      .catch(() => {});
  }, 500);
}

/** How long a walked node is trusted before the portal is asked again. */
const REVALIDATE_S = 7 * 24 * 60 * 60;

/**
 * Run `fn` once per `key`; concurrent callers await the same promise.
 *
 * The result also goes through Next's data cache, which outlives the process
 * and is shared between instances — on a serverless host each instance starts
 * with an empty memory and a scratch disk, and without it every cold start
 * would re-walk the portal for every dropdown.
 */
async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const durable = unstable_cache(fn, ["bhumi-tree", String(CACHE_VERSION), key], {
    revalidate: REVALIDATE_S,
  });
  const p = durable().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Whatever the server already knows about a locator, for the first paint. */
export interface TreeSnapshot {
  districts?: Option[];
  talukas?: Option[];
  villages?: Option[];
  context?: VillageContext;
  nameTypes?: Option[];
}

/**
 * Read-only peek at the cache for server rendering.
 *
 * This deliberately never triggers a portal walk: a cold entry would put ~5s of
 * scraping in front of TTFB, which is exactly the latency the cache exists to
 * hide. Anything already warm is rendered as real HTML; anything missing is
 * kicked off in the background and left to the client to fetch, so the next
 * visitor gets it server-rendered.
 */
export async function peekTree(
  rt: RecordType,
  district: string | null,
  taluka: string | null,
  village: string | null,
): Promise<TreeSnapshot> {
  await ensureLoaded();
  const snapshot: TreeSnapshot = {};

  // Anything missing is fetched in the background (never awaited), so the next
  // visit to the same link is fully server-rendered. `once()` means a warm and
  // the client's own request share a single portal walk rather than racing.
  const warm = (fn: () => Promise<unknown>) => void fn().catch(() => {});

  snapshot.districts = cache.districts[rt];
  if (!snapshot.districts) warm(() => getDistricts(rt));

  if (district) {
    snapshot.talukas = cache.talukas[`${rt}|${district}`];
    if (!snapshot.talukas) warm(() => getTalukas(rt, district));
  }
  if (district && taluka) {
    snapshot.villages = cache.villages[`${rt}|${district}|${taluka}`];
    if (!snapshot.villages) warm(() => getVillages(rt, district, taluka));
  }
  if (district && taluka && village) {
    snapshot.context = cache.context[`${rt}|${district}|${taluka}|${village}`];
    if (!snapshot.context) warm(() => getContext(rt, district, taluka, village));

    // Name sub-types are per record type, so this walk happens at most once per
    // record type for the whole app — cheap enough to do eagerly, and it means
    // switching to name search never waits on the portal.
    if (rt !== "KJP") {
      snapshot.nameTypes = cache.nameTypes[rt];
      if (!snapshot.nameTypes) warm(() => getNameTypes(rt, district, taluka, village));
    }
  }
  return snapshot;
}

export async function getDistricts(rt: RecordType): Promise<Option[]> {
  await ensureLoaded();
  if (cache.districts[rt]) return cache.districts[rt]!;
  const districts = await once(`d|${rt}`, () => new MahabhulekhClient().start(rt));
  cache.districts[rt] = districts;
  persistSoon();
  return districts;
}

export async function getTalukas(rt: RecordType, district: string): Promise<Option[]> {
  await ensureLoaded();
  const key = `${rt}|${district}`;
  if (cache.talukas[key]) return cache.talukas[key]!;
  const talukas = await once(`t|${key}`, async () => {
    const client = new MahabhulekhClient();
    await client.start(rt);
    return client.selectDistrict(district);
  });
  cache.talukas[key] = talukas;
  persistSoon();
  return talukas;
}

export async function getVillages(
  rt: RecordType,
  district: string,
  taluka: string,
): Promise<Option[]> {
  await ensureLoaded();
  const key = `${rt}|${district}|${taluka}`;
  if (cache.villages[key]) return cache.villages[key]!;
  const villages = await once(`v|${key}`, async () => {
    const client = new MahabhulekhClient();
    await client.start(rt);
    await client.selectDistrict(district);
    return client.selectTaluka(taluka);
  });
  cache.villages[key] = villages;
  persistSoon();
  return villages;
}

/**
 * The occupant-name search sub-types, which the portal returns identically for
 * every village — hence the per-record-type key. The locator is still needed to
 * populate the entry, because reaching the control means walking to *a* village.
 */
export async function getNameTypes(
  rt: RecordType,
  district: string,
  taluka: string,
  village: string,
): Promise<Option[]> {
  await ensureLoaded();
  if (cache.nameTypes[rt]) return cache.nameTypes[rt]!;
  const nameTypes = await once(`n|${rt}`, async () => {
    const client = new MahabhulekhClient();
    await client.start(rt);
    await client.selectDistrict(district);
    await client.selectTaluka(taluka);
    await client.selectVillage(village);
    return client.setSearchMode("name");
  });
  cache.nameTypes[rt] = nameTypes;
  persistSoon();
  return nameTypes;
}

export async function getContext(
  rt: RecordType,
  district: string,
  taluka: string,
  village: string,
): Promise<VillageContext> {
  await ensureLoaded();
  const key = `${rt}|${district}|${taluka}|${village}`;
  if (cache.context[key]) return cache.context[key]!;
  const context = await once(`c|${key}`, async () => {
    const client = new MahabhulekhClient();
    await client.start(rt);
    await client.selectDistrict(district);
    await client.selectTaluka(taluka);
    return client.selectVillage(village);
  });
  cache.context[key] = context;
  persistSoon();
  return context;
}
