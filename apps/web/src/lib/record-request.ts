"use client";

/**
 * Assembling a record request.
 *
 * A URL names a document; the portal needs rather more than that to serve one.
 * Three things have to be reconciled against the village first — the language,
 * the search sub-type, and the device's mobile number — and getting any of them
 * wrong is a failed round trip, so the rules live here rather than in whichever
 * screen happened to need them first.
 */

import type { Lookup } from "./search-params";
import { isComplete } from "./search-params";
import type { VillageContext } from "./client";

export const MOBILE = /^[6-9]\d{9}$/;

/**
 * Personal, and required by the portal on every fetch, so it stays on the
 * device and never enters the URL — a shared link must not carry the sharer's
 * phone number.
 */
const MOBILE_KEY = "bhumi_mobile";

export const readMobile = (): string => localStorage.getItem(MOBILE_KEY) ?? "";
export const saveMobile = (value: string): void => localStorage.setItem(MOBILE_KEY, value);

/**
 * The requested language if this village offers it, otherwise its closest
 * substitute. A link can carry a language chosen in a village whose list is
 * different, and the portal rejects one it does not serve.
 */
export function resolveLanguage(ctx: VillageContext | null, lang: string): string {
  if (!ctx?.languages.length || ctx.languages.some((l) => l.value === lang)) return lang;
  return (ctx.languages.find((l) => l.value === "en_in") ?? ctx.languages[0]!).value;
}

/**
 * The search sub-type to send.
 *
 * A link built by the search form carries the one the user picked. A link built
 * from the collection carries none, deliberately: the sub-type is village
 * reference data (`सर्वे नंबर` for 7/12, `खाते क्रमांक` for 8A), so filling it
 * in here from the village's own context means a saved land keeps working if
 * the portal ever renumbers its dropdowns.
 */
export function resolveSearchType(
  ctx: VillageContext | null,
  lookup: Lookup | null,
): string | null {
  if (!lookup) return null;
  return lookup.st ?? ctx?.searchTypes[0]?.value ?? null;
}

/**
 * The portal's record request — or null when any part of it is still missing,
 * which is exactly the condition for "cannot fetch yet".
 *
 * Every input is an argument rather than closed-over state, so an arriving link
 * can be validated against the values *it* carried, before the form settles.
 */
export function recordInput(
  lookup: Lookup | null,
  language: string,
  mobile: string,
  searchType: string | null,
): Record<string, unknown> | null {
  if (!lookup || !MOBILE.test(mobile) || !isComplete(lookup)) return null;
  if (lookup.type === "KJP") {
    // KJP addresses its record by measurement number; it has no parcel.
    const { q: measurementNumber, sankalan, purpose, duration } = lookup;
    return { measurementNumber, sankalan, purpose, duration, mobile, language };
  }
  if (!searchType) return null;
  // The search travels with the parcel so the server can re-run it when its
  // live session no longer has the parcel dropdown populated.
  return { parcel: lookup.parcel, mobile, language, searchType, query: lookup.q };
}
