import type { NextRequest } from "next/server";
import { BadRequest, cacheForAMonth, readPlace, withHandler } from "@/lib/api";
import { getParcelMap } from "@/lib/parcel-map";

/**
 * A 7/12 parcel's place on Bhunaksha's village map. Public, slow-changing data
 * with no session behind it, so the CDN may keep it as long as the server does.
 */
export async function GET(req: NextRequest) {
  return cacheForAMonth(
    await withHandler(async () => {
      const { district, taluka, village } = readPlace(req.nextUrl.searchParams, true);
      const survey = req.nextUrl.searchParams.get("survey")?.trim();
      if (!survey) throw new BadRequest("No survey number.");
      return getParcelMap(district, taluka, village, survey);
    }),
  );
}
