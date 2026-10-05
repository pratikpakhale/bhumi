import { NextResponse } from "next/server";
import { z } from "zod";
import { MahabhulekhError } from "@bhumi/core";
import { RECORD_TYPES, SEARCH_MODES } from "./search-params";

/**
 * The server's side of the API contract.
 *
 * Every route body runs through {@link withHandler}, and every input is parsed
 * by a schema here before it reaches the portal. That gives the client exactly
 * three kinds of failure to tell apart, each with its own status:
 *
 * - **400** — the request itself is malformed. Never retryable; a bug or a
 *   hand-edited link.
 * - **422 / 503** — the portal answered with a refusal, or failed to answer.
 *   Only the second is worth retrying.
 * - **500** — anything else. Its message is never sent: an unexpected error's
 *   text is an implementation detail, and occasionally a path or a token.
 */

/** A request this server will not act on. */
export class BadRequest extends Error {}

export async function withHandler<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof BadRequest || err instanceof z.ZodError) {
      const message = err instanceof BadRequest ? err.message : "That request is not one Bhumi understands.";
      return NextResponse.json({ error: message, retryable: false }, { status: 400 });
    }
    if (err instanceof MahabhulekhError) {
      // 503 marks the portal being unwell (worth retrying); 422 is its answer.
      return NextResponse.json(
        { error: err.message, alerts: err.alerts, retryable: err.retryable },
        { status: err.retryable ? 503 : 422 },
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Please try again.", retryable: true },
      { status: 500 },
    );
  }
}

/** Read and validate a JSON body. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw: unknown = await req.json().catch(() => {
    throw new BadRequest("The request body is not JSON.");
  });
  return schema.parse(raw);
}

// ── Vocabulary ───────────────────────────────────────────────────────────────
//
// Portal codes are short digit strings (village codes are long ones); values
// that come back from the portal's own dropdowns — search sub-types, parcels,
// KJP classifications — are opaque, so they are only bounded, never shaped.

const code = z.string().regex(/^\d{1,24}$/);
const opaque = z.string().trim().max(200);

const recordType = z.enum(RECORD_TYPES);
const searchMode = z.enum(SEARCH_MODES);

export const locator = z.object({
  recordType,
  district: code,
  taluka: code,
  village: code,
});

export const searchBody = locator.extend({
  mode: searchMode.default("number"),
  searchType: opaque.min(1),
  query: opaque.default(""),
});

export const primeBody = locator.extend({ mode: searchMode.default("number") });

export const recordBody = locator.extend({
  mode: searchMode.default("number"),
  searchType: opaque.optional(),
  query: opaque.default(""),
  parcel: opaque.optional(),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  language: opaque.min(1),
  measurementNumber: opaque.optional(),
  sankalan: opaque.optional(),
  purpose: opaque.optional(),
  duration: opaque.optional(),
});

/** A 7/12 place out of a query string: a taluka, and a village when `needVillage`. */
export function readPlace(p: URLSearchParams, needVillage: true): { district: string; taluka: string; village: string };
export function readPlace(p: URLSearchParams, needVillage?: false): { district: string; taluka: string; village: string | null };
export function readPlace(p: URLSearchParams, needVillage = false) {
  const district = p.get("district") ?? "";
  const taluka = p.get("taluka") ?? "";
  const village = p.get("village") || null;
  if (!/^\d{1,2}$/.test(district) || !/^\d{1,2}$/.test(taluka)) throw new BadRequest("Not a taluka.");
  if ((needVillage || village) && !/^\d{6,}$/.test(village ?? "")) throw new BadRequest("Not a village.");
  return { district, taluka, village };
}

/** Bhunaksha answers change on the scale of years; let the CDN keep them for a month. */
export function cacheForAMonth(res: NextResponse): NextResponse {
  if (res.ok) res.headers.set("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=2592000");
  return res;
}

/** Reference data changes on the scale of months; a day at the edge is safe. */
export function cacheForADay(res: NextResponse): NextResponse {
  if (res.ok) res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
