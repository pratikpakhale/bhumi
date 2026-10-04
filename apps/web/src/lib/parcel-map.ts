/**
 * Where a parcel is, from Bhunaksha.
 *
 * Village maps and plot outlines change on the scale of years (a re-survey, a
 * partition), so every answer goes through Next's data cache for a month: the
 * portal is asked once per plot, not once per visitor. Map tiles are cached by
 * the CDN instead — see the tile route.
 */

import { unstable_cache } from "next/cache";
import { matchPlot, type MapPlot, type VillageMap } from "@bhumi/core";
import { BhunakshaClient } from "@bhumi/core/server";

export interface ParcelMap {
  /** `null` when Bhunaksha has no georeferenced map for the village. */
  village: VillageMap | null;
  /** The drawn plot the survey number falls in, `null` when it is not drawn. */
  plot: MapPlot | null;
}

const REVALIDATE_S = 30 * 24 * 60 * 60;

// One client for the process, so the firewall cookie is earned once.
const g = globalThis as { __bhunaksha?: BhunakshaClient };
export const bhunaksha = (g.__bhunaksha ??= new BhunakshaClient());

const cached = <A extends string[], T>(name: string, fn: (...args: A) => Promise<T>) =>
  unstable_cache(fn, ["bhunaksha", name], { revalidate: REVALIDATE_S });

const villageMap = cached("village", (d: string, t: string, v: string) => bhunaksha.village(d, t, v));
const plotNumbers = cached("plots", (gisCode: string) => bhunaksha.plotNumbers(gisCode));
const plot = cached("plot", (gisCode: string, number: string) => bhunaksha.plot(gisCode, number));

export async function getParcelMap(
  district: string,
  taluka: string,
  village: string,
  survey: string,
): Promise<ParcelMap> {
  const map = await villageMap(district, taluka, village);
  if (!map) return { village: null, plot: null };
  const number = matchPlot(survey, await plotNumbers(map.gisCode));
  return { village: map, plot: number ? await plot(map.gisCode, number) : null };
}
