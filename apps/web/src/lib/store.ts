/**
 * Server-side store of the *stateful* search session.
 *
 * Dropdown navigation is served entirely from the cached tree (see `tree.ts`)
 * and never lands here. A live {@link MahabhulekhClient} is built only when the
 * user actually searches, positioned at the chosen village and search mode.
 *
 * The session is keyed per browser (an httpOnly cookie) and by its location +
 * mode. If the user searches somewhere else, or flips number/name, we rebuild
 * from scratch — the portal's session carries state that doesn't survive those
 * transitions, so a fresh walk is both simpler and correct.
 *
 * A portal session is a single conversation: each postback must carry the
 * ViewState the previous one returned. Two requests from one browser (a warm-up
 * racing a search, two tabs) interleaving on it would each post stale state, so
 * all work on a browser's session runs strictly one at a time through
 * {@link withSession}. A request that fails leaves the conversation in an
 * unknown state, so its session is dropped and the next request starts afresh.
 */

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { Option, RecordType, SearchMode } from "@bhumi/core";
import { MahabhulekhClient } from "@bhumi/core/server";

export const SESSION_COOKIE = "bhumi_sid";
const TTL_MS = 20 * 60 * 1000;

export interface Locator {
  recordType: RecordType;
  district: string;
  taluka: string;
  village: string;
  mode: SearchMode;
}

export interface Entry {
  client: MahabhulekhClient;
  key: string;
  touched: number;
  /**
   * Signature of the search whose results the portal's parcel dropdown holds,
   * if any.
   *
   * The portal only populates its parcel dropdown as a side effect of a search,
   * and a record can only be pulled for a parcel that is in that dropdown. So a
   * fetch has to know whether the live session has already asked the question
   * its parcel came from, and repeat it if not. Cleared after a record is
   * pulled: submitting a record request reshapes the page, and asking again is
   * cheap next to a failed fetch.
   */
  searched: string | null;
  /**
   * What that search returned, kept so a fetch can resolve the parcel it was
   * asked for against the rows the dropdown actually holds — see the record
   * route. Empty until a search has run.
   */
  parcels: Option[];
}

/** Identifies a search, so a fetch can tell whether it still needs to run one. */
export const searchSignature = (mode: SearchMode, searchType: string, query: string) =>
  `${mode}|${searchType}|${query.trim()}`;

const g = globalThis as Record<string, unknown>;
const registry: Map<string, Entry> =
  (g.__bhumiSessions as Map<string, Entry>) ?? (g.__bhumiSessions = new Map());
/** The tail of each browser's queue of work; see {@link withSession}. */
const queues: Map<string, Promise<unknown>> =
  (g.__bhumiQueues as Map<string, Promise<unknown>>) ?? (g.__bhumiQueues = new Map());

function sweep(): void {
  const now = Date.now();
  for (const [id, e] of registry) if (now - e.touched > TTL_MS) registry.delete(id);
}

async function sessionId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(SESSION_COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    jar.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TTL_MS / 1000,
    });
  }
  return id;
}

const keyOf = (l: Locator) =>
  [l.recordType, l.district, l.taluka, l.village, l.mode].join("|");

/**
 * Run `fn` against this browser's live client, positioned at `loc` — reusing
 * the existing one when it is already there, otherwise walking a fresh cascade.
 * Calls for the same browser are queued, never interleaved. KJP has no search
 * mode; `mode` is ignored for it.
 */
export async function withSession<T>(loc: Locator, fn: (entry: Entry) => Promise<T>): Promise<T> {
  sweep();
  const id = await sessionId();
  const run = async (): Promise<T> => {
    try {
      const entry = await positioned(id, loc);
      return await fn(entry);
    } catch (err) {
      registry.delete(id);
      throw err;
    }
  };
  const previous = queues.get(id) ?? Promise.resolve();
  const result = previous.then(run, run);
  const tail = result.catch(() => {});
  queues.set(id, tail);
  void tail.then(() => {
    if (queues.get(id) === tail) queues.delete(id);
  });
  return result;
}

async function positioned(id: string, loc: Locator): Promise<Entry> {
  const key = keyOf(loc);
  const existing = registry.get(id);
  if (existing && existing.key === key) {
    existing.touched = Date.now();
    return existing;
  }
  registry.delete(id);

  const client = new MahabhulekhClient();
  await client.start(loc.recordType);
  await client.selectDistrict(loc.district);
  await client.selectTaluka(loc.taluka);
  await client.selectVillage(loc.village);
  if (loc.recordType !== "KJP" && loc.mode === "name") {
    await client.setSearchMode("name");
  }
  const entry: Entry = { client, key, touched: Date.now(), searched: null, parcels: [] };
  registry.set(id, entry);
  return entry;
}
