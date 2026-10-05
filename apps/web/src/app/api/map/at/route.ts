import type { NextRequest } from "next/server";
import { BadRequest, readPlace, withHandler } from "@/lib/api";
import { getPlotAt } from "@/lib/parcel-map";

/** May have to place the taluka first; see the taluka route. */
export const maxDuration = 60;

/**
 * The plot under a tapped point. `village` is the one being looked at and is
 * searched first; the rest of the taluka is searched after it, so a tap across
 * a village line still finds its field.
 */
export async function GET(req: NextRequest) {
  return withHandler(async () => {
    const p = req.nextUrl.searchParams;
    const { district, taluka, village } = readPlace(p);
    const at: [number, number] = [Number(p.get("lng")), Number(p.get("lat"))];
    // Maharashtra, generously: anything outside it cannot be in the taluka.
    if (!(at[0] > 70 && at[0] < 82 && at[1] > 14 && at[1] < 23)) throw new BadRequest("Not a point in Maharashtra.");
    return getPlotAt(district, taluka, at, village);
  });
}
