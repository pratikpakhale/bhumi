/**
 * The whole selection path lives in the URL, so any state is shareable by
 * copying the link. This is the single source of truth for those params — the
 * page reads/writes them with `useQueryStates(searchParams)` and derives every
 * cached dropdown from them, which also means a shared link reconstructs the
 * entire form.
 *
 * Parsers are imported from `nuqs/server` so this module is safe to import from
 * both server and client code (e.g. a future `createLoader`).
 *
 * The occupant's mobile number is deliberately NOT here: it's personal, is
 * required by the portal, and is kept in `localStorage` instead of the URL.
 */

import {
  createLoader,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from "nuqs/server";
import type { RecordType, SearchMode } from "@bhumi/core";

export const RECORD_TYPES = ["7/12", "8A", "PropertyCard", "KJP"] as const;
export const SEARCH_MODES = ["number", "name"] as const;

// Compile-time guard that the literals above stay in sync with the core types.
const _rt: readonly RecordType[] = RECORD_TYPES;
const _sm: readonly SearchMode[] = SEARCH_MODES;
void _rt;
void _sm;

export const searchParams = {
  /** Record type — 7/12, 8A, Property Card or Kami-Jasti. */
  type: parseAsStringLiteral(RECORD_TYPES).withDefault("7/12"),
  /** Location cascade. Null until chosen. */
  district: parseAsString,
  taluka: parseAsString,
  village: parseAsString,
  /** Search by survey/gat number or by occupant name (non-KJP). */
  mode: parseAsStringLiteral(SEARCH_MODES).withDefault("number"),
  /** Selected search sub-type (its value depends on record type + mode). */
  st: parseAsString,
  /** The query text — a survey/gat number, an occupant name, or (KJP) a mojani number. */
  q: parseAsString.withDefault(""),
  /** The chosen parcel/occupant from the search results. */
  parcel: parseAsString,
  /** KJP-only selectors. */
  sankalan: parseAsString,
  purpose: parseAsString,
  duration: parseAsString,
  /** Output language. */
  lang: parseAsString.withDefault("en_in"),
  /**
   * Legacy: marks a link that points at the *document* rather than the form.
   *
   * Nothing writes it any more — `/record` is the document view and its own URL
   * is the shareable link. It is still parsed so that links shared before that
   * split still land on the record: the search page reads it once and forwards.
   */
  open: parseAsBoolean.withDefault(false),
};

/** The parsed shape of every param above. */
export type SearchState = inferParserType<typeof searchParams>;

/**
 * Parses the same params on the server, so the page can render the selection
 * as HTML before any JavaScript runs.
 */
export const loadSearchParams = createLoader(searchParams);

/**
 * The subset of the params that *names a document* — everything the portal
 * needs to resolve one record, and nothing else.
 *
 * Two params are deliberately excluded. `lang` is a property of whoever is
 * reading, not of the land, so two people wanting the same parcel in different
 * scripts are not holding different lookups. `open` is a link mode, not data.
 * Keeping both out is what lets a {@link Lookup} be a stable identity: saved,
 * deduped and used as a snapshot key.
 *
 * The field names are the param names on purpose — one vocabulary for the URL,
 * the saved collection and the snapshot store, so there is no mapping table to
 * drift.
 */
export interface Lookup {
  type: RecordType;
  district: string;
  taluka: string;
  village: string;
  mode: SearchMode;
  st: string | null;
  q: string;
  parcel: string | null;
  sankalan: string | null;
  purpose: string | null;
  duration: string | null;
}

/** The lookup a URL names, or null while the location is still incomplete. */
export function lookupFrom(sp: SearchState): Lookup | null {
  if (!sp.district || !sp.taluka || !sp.village) return null;
  return {
    type: sp.type,
    district: sp.district,
    taluka: sp.taluka,
    village: sp.village,
    mode: sp.mode,
    st: sp.st,
    q: sp.q.trim(),
    parcel: sp.parcel,
    sankalan: sp.sankalan,
    purpose: sp.purpose,
    duration: sp.duration,
  };
}

/**
 * Whether a lookup actually addresses a document rather than just a village.
 * The standard flow needs a chosen parcel; KJP needs its three classifications
 * plus a measurement number.
 */
export function isComplete(l: Lookup): boolean {
  return l.type === "KJP"
    ? !!(l.q && l.sankalan && l.purpose && l.duration)
    : !!l.parcel;
}

/**
 * A lookup's stable identity — *which document* it names, and nothing about how
 * it was reached.
 *
 * `mode`, `st` and `q` are the route, and the portal offers several: parcel
 * `167/2` found by typing `167` and found by searching the surname `पाखले` is
 * one extract, reached two ways. Keying on the route would file it as two, so
 * the route is left out. That is what makes this safe as both the snapshot
 * store's foreign key and the collection's dedup key.
 *
 * KJP is the exception, and the reason the branch exists: it has no parcel, and
 * its measurement number plus the three classifications *are* the address.
 */
export function lookupKey(l: Lookup): string {
  return l.type === "KJP"
    ? ["KJP", l.district, l.taluka, l.village, l.q, l.sankalan ?? "", l.purpose ?? "", l.duration ?? ""].join("|")
    : [l.type, l.district, l.taluka, l.village, l.parcel ?? ""].join("|");
}

/**
 * Render a lookup back into a query string.
 *
 * This is the only place a saved entry becomes a URL, which is the point: the
 * collection stores fields, never a formatted link, so renaming a param here
 * migrates every saved land at once instead of silently breaking them all.
 */
export function toQuery(l: Lookup, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  const set = (k: string, v: string | null) => {
    if (v) params.set(k, v);
  };
  set("type", l.type);
  set("district", l.district);
  set("taluka", l.taluka);
  set("village", l.village);
  set("mode", l.mode);
  set("st", l.st);
  set("q", l.q);
  set("parcel", l.parcel);
  set("sankalan", l.sankalan);
  set("purpose", l.purpose);
  set("duration", l.duration);
  for (const [k, v] of Object.entries(extra)) set(k, v);
  return params.toString();
}

/** Link straight to the document view for a lookup. */
export const recordHref = (l: Lookup, lang?: string) =>
  `/record?${toQuery(l, lang ? { lang } : {})}`;

/** Link back to the search form, with this lookup filled in. */
export const searchHref = (l: Lookup, lang?: string) =>
  `/?${toQuery(l, lang ? { lang } : {})}`;
