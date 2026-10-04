import type { NextRequest } from "next/server";
import { withHandler } from "@/lib/api";
import { getParcelMap } from "@/lib/parcel-map";

/**
 * A 7/12 parcel's place on Bhunaksha's village map. Public, slow-changing data
 * with no session behind it, so the CDN may keep it as long as the server does.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const district = p.get("district") ?? "";
  const taluka = p.get("taluka") ?? "";
  const village = p.get("village") ?? "";
  const survey = p.get("survey") ?? "";
  const res = await withHandler(async () => {
    if (!/^\d{1,2}$/.test(district) || !/^\d{1,2}$/.test(taluka) || !/^\d{6,}$/.test(village)) {
      throw new Error("Not a village");
    }
    if (!survey.trim()) throw new Error("No survey number");
    return getParcelMap(district, taluka, village, survey);
  });
  if (res.ok) {
    res.headers.set("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=2592000");
  }
  return res;
}
