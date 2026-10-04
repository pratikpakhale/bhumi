import { NextResponse } from "next/server";
import { MahabhulekhError } from "@bhumi/core";

/** Wrap a route body with consistent JSON error handling. */
export async function withHandler<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof MahabhulekhError) {
      // 503 marks the portal being unwell (worth retrying); 422 is its answer.
      return NextResponse.json(
        { error: err.message, alerts: err.alerts, retryable: err.retryable },
        { status: err.retryable ? 503 : 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** A 7/12 place out of a query string: a taluka, and a village when `needVillage`. */
export function readPlace(p: URLSearchParams, needVillage: true): { district: string; taluka: string; village: string };
export function readPlace(p: URLSearchParams, needVillage?: false): { district: string; taluka: string; village: string | null };
export function readPlace(p: URLSearchParams, needVillage = false) {
  const district = p.get("district") ?? "";
  const taluka = p.get("taluka") ?? "";
  const village = p.get("village") || null;
  if (!/^\d{1,2}$/.test(district) || !/^\d{1,2}$/.test(taluka)) throw new Error("Not a taluka");
  if ((needVillage || village) && !/^\d{6,}$/.test(village ?? "")) throw new Error("Not a village");
  return { district, taluka, village };
}

/** Bhunaksha answers change on the scale of years; let the CDN keep them for a month. */
export function cacheForAMonth(res: NextResponse): NextResponse {
  if (res.ok) res.headers.set("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=2592000");
  return res;
}
