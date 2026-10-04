import type { NextRequest } from "next/server";
import { cacheForAMonth, readPlace, withHandler } from "@/lib/api";
import { getVillagePlots } from "@/lib/parcel-map";

/** A village's map and every plot number drawn on it. */
export async function GET(req: NextRequest) {
  return cacheForAMonth(
    await withHandler(async () => {
      const { district, taluka, village } = readPlace(req.nextUrl.searchParams, true);
      return getVillagePlots(district, taluka, village);
    }),
  );
}
