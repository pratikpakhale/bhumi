import type { NextRequest } from "next/server";
import { cacheForAMonth, readPlace, withHandler } from "@/lib/api";
import { getTalukaMap } from "@/lib/parcel-map";

/** Placing a cold taluka asks Bhunaksha about each of its villages. */
export const maxDuration = 60;

/** Every mapped village in a taluka, with its extent. */
export async function GET(req: NextRequest) {
  let complete = false;
  const res = await withHandler(async () => {
    const { district, taluka } = readPlace(req.nextUrl.searchParams);
    const map = await getTalukaMap(district, taluka);
    complete = map.complete;
    return map;
  });
  // A partial list is served, but not kept: the next visitor asks again.
  return complete ? cacheForAMonth(res) : res;
}
