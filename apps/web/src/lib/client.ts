/**
 * Browser-side API wrapper.
 *
 * Reference data (the district → taluka → village tree and per-village context)
 * is fetched from the cached `/api/tree` endpoint and memoised here too, so
 * re-navigating the dropdowns within a session is instant and never hits the
 * network twice for the same node. Only searching and fetching a record touch
 * the live server session.
 */

import type { Option, RecordType, RecordDocument, SearchMode } from "@bhumi/core";
import type { ParcelMap, PlotPick, TalukaMap, VillagePlots } from "./parcel-map";

export interface VillageContext {
  searchTypes: Option[];
  languages: Option[];
  kjp?: { sankalan: Option[]; purpose: Option[]; duration: Option[] };
}

export interface Locator {
  recordType: RecordType;
  district: string;
  taluka: string;
  village: string;
}

const memo = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().catch((e) => {
    memo.delete(key); // don't cache failures
    throw e;
  });
  memo.set(key, p);
  return p;
}

/** An API failure; `retryable` when the portal, not the request, was at fault. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function readJSON<T>(res: Response): Promise<T> {
  // A platform timeout or crash answers with an HTML page, not our JSON.
  const data = (await res.json().catch(() => null)) as (T & { error?: string; retryable?: boolean }) | null;
  if (res.ok && data) return data;
  if (!data?.error) {
    throw new ApiError("The server took too long to answer. Please try again.", true);
  }
  throw new ApiError(data.error, data.retryable ?? res.status >= 500);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("You appear to be offline. Check your connection and try again.", true);
  }
  return readJSON<T>(res);
}

const getJSON = <T,>(url: string) => request<T>(url);

const postJSON = <T,>(url: string, body: unknown) =>
  request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const api = {
  districts: (recordType: RecordType) =>
    cached(`d|${recordType}`, () =>
      getJSON<{ districts: Option[] }>(`/api/tree?${qs({ kind: "districts", recordType })}`).then(
        (r) => r.districts,
      ),
    ),

  talukas: (recordType: RecordType, district: string) =>
    cached(`t|${recordType}|${district}`, () =>
      getJSON<{ talukas: Option[] }>(
        `/api/tree?${qs({ kind: "talukas", recordType, district })}`,
      ).then((r) => r.talukas),
    ),

  villages: (recordType: RecordType, district: string, taluka: string) =>
    cached(`v|${recordType}|${district}|${taluka}`, () =>
      getJSON<{ villages: Option[] }>(
        `/api/tree?${qs({ kind: "villages", recordType, district, taluka })}`,
      ).then((r) => r.villages),
    ),

  context: (recordType: RecordType, district: string, taluka: string, village: string) =>
    cached(`c|${recordType}|${district}|${taluka}|${village}`, () =>
      getJSON<{ context: VillageContext }>(
        `/api/tree?${qs({ kind: "context", recordType, district, taluka, village })}`,
      ).then((r) => r.context),
    ),

  /** Warm the live session for a village; fire-and-forget, errors ignored. */
  prime: (loc: Locator, mode: SearchMode = "number") => {
    void postJSON("/api/prime", { ...loc, mode }).catch(() => {});
  },

  /**
   * Name sub-types are the same for every village of a record type, so they are
   * cached server-side alongside the rest of the reference data and keyed here
   * by record type alone.
   */
  nameTypes: ({ recordType, district, taluka, village }: Locator) =>
    cached(`n|${recordType}`, () =>
      getJSON<{ nameTypes: Option[] }>(
        `/api/tree?${qs({ kind: "nameTypes", recordType, district, taluka, village })}`,
      ).then((r) => r.nameTypes),
    ),

  /**
   * Memoised for the page's lifetime, so returning to a search (back button, a
   * shared link opened twice) shows its rows at once instead of re-asking the
   * portal. Records change rarely enough that a stale list is harmless — the
   * record itself is always fetched fresh.
   */
  search: (loc: Locator, mode: SearchMode, searchType: string, query: string) =>
    cached(
      `s|${loc.recordType}|${loc.district}|${loc.taluka}|${loc.village}|${mode}|${searchType}|${query.trim()}`,
      () =>
        postJSON<{ parcels: Option[] }>("/api/search", { ...loc, mode, searchType, query }).then(
          (r) => r.parcels,
        ),
    ),

  /** Whether {@link search} already holds an answer for this question. */
  hasSearch: (loc: Locator, mode: SearchMode, searchType: string, query: string) =>
    memo.has(
      `s|${loc.recordType}|${loc.district}|${loc.taluka}|${loc.village}|${mode}|${searchType}|${query.trim()}`,
    ),

  /**
   * `input` should carry the `searchType` + `query` that produced the parcel:
   * the portal only populates its parcel dropdown as a side effect of
   * searching, so the server may need to repeat that search before it can
   * fetch. Sending it makes the request work even on a rebuilt session.
   */
  record: (loc: Locator, mode: SearchMode, input: Record<string, unknown>) =>
    postJSON<{ document: RecordDocument }>("/api/record", { ...loc, mode, ...input }).then(
      (r) => r.document,
    ),

  /** Where a 7/12 survey number lies on Bhunaksha's village map. */
  parcelMap: (district: string, taluka: string, village: string, survey: string) =>
    cached(`m|${district}|${taluka}|${village}|${survey}`, () =>
      getJSON<ParcelMap>(`/api/map?${qs({ district, taluka, village, survey })}`),
    ),

  /** Every mapped village in a taluka, with its extent. */
  talukaMap: (district: string, taluka: string) =>
    cached(`mt|${district}|${taluka}`, () =>
      getJSON<TalukaMap>(`/api/map/taluka?${qs({ district, taluka })}`),
    ),

  /** A village's map and the plot numbers drawn on it. */
  villagePlots: (district: string, taluka: string, village: string) =>
    cached(`mv|${district}|${taluka}|${village}`, () =>
      getJSON<VillagePlots>(`/api/map/village?${qs({ district, taluka, village })}`),
    ),

  /**
   * The plot under a point, looked for in `village` first. What it finds is
   * also the answer {@link parcelMap} would give for that plot, so it is kept
   * under that key: opening the plot it found costs nothing more.
   */
  plotAt: async (district: string, taluka: string, village: string | null, [lng, lat]: [number, number]) => {
    const pick = await getJSON<PlotPick>(
      `/api/map/at?${qs({ district, taluka, ...(village && { village }), lng: lng.toFixed(7), lat: lat.toFixed(7) })}`,
    );
    if (pick.code && pick.plot) {
      const key = `m|${district}|${taluka}|${pick.code}|${pick.plot.number}`;
      if (!memo.has(key)) memo.set(key, Promise.resolve({ village: pick.village, plot: pick.plot }));
    }
    return pick;
  },
};

export type { Option, RecordType, RecordDocument, SearchMode, ParcelMap, PlotPick, TalukaMap, VillagePlots };
