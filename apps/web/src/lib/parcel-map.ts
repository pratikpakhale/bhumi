/**
 * Where land is, from Bhunaksha.
 *
 * Village maps and plot outlines change on the scale of years (a re-survey, a
 * partition), so every answer goes through Next's data cache for a month: the
 * portal is asked once per village or plot, not once per visitor. Map tiles are
 * cached by the CDN instead — see the tile route.
 */

import { unstable_cache } from "next/cache";
import pLimit from "p-limit";
import { bhunakshaCode, matchPlot, type Bounds, type MapPlot, type VillageMap } from "@bhumi/core";
import { BhunakshaClient } from "@bhumi/core/server";
import { getVillages } from "./tree";
import { contains } from "./geo";

export interface ParcelMap {
  /** `null` when Bhunaksha has no georeferenced map for the village. */
  village: VillageMap | null;
  /** The drawn plot the survey number falls in, `null` when it is not drawn. */
  plot: MapPlot | null;
}

/** A village with a map, placed. */
export interface PlacedVillage {
  /** Mahabhulekh's village code — the same 18 digits Bhunaksha uses. */
  code: string;
  /** Bhunaksha's address for it, see `bhunakshaCode`. */
  gisCode: string;
  name: string;
  bounds: Bounds;
}

export interface TalukaMap {
  villages: PlacedVillage[];
  /** False when some villages could not be asked about; the list is then partial. */
  complete: boolean;
}

export interface VillagePlots {
  village: VillageMap | null;
  /** Every plot number drawn on the village map. */
  plots: string[];
}

/** What is under a point on the map. */
export interface PlotPick extends ParcelMap {
  /** The village code the plot is in, `null` when no plot is drawn there. */
  code: string | null;
}

const REVALIDATE_S = 30 * 24 * 60 * 60;

/** Bhunaksha is one government server; a taluka is placed a few villages at a time. */
const FAN_OUT = 6;

// One client for the process, so the firewall cookie is earned once.
const g = globalThis as { __bhunaksha?: BhunakshaClient };
export const bhunaksha = (g.__bhunaksha ??= new BhunakshaClient());

const cached = <A extends string[], T>(name: string, fn: (...args: A) => Promise<T>) =>
  unstable_cache(fn, ["bhunaksha", name], { revalidate: REVALIDATE_S });

const villageMap = cached("village-zone", (d: string, t: string, v: string) => bhunaksha.village(d, t, v));
const villageBounds = cached("village-bounds", (gisCode: string) => bhunaksha.villageBounds(gisCode));
const plotNumbers = cached("plots", (gisCode: string) => bhunaksha.plotNumbers(gisCode));
const plot = cached("plot-holdings", (gisCode: string, number: string) => bhunaksha.plot(gisCode, number));

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

export async function getVillagePlots(district: string, taluka: string, village: string): Promise<VillagePlots> {
  const map = await villageMap(district, taluka, village);
  return { village: map, plots: map ? await plotNumbers(map.gisCode) : [] };
}

/**
 * Every mapped village in a taluka, placed — what lets the map be walked across
 * village lines instead of one village at a time.
 *
 * The villages are Mahabhulekh's 7/12 list, so every code here is one a 7/12
 * can be fetched for. Each village's extent is cached on its own: a cold taluka
 * costs one request per village once, and a village the portal failed to answer
 * for is simply asked again next time rather than missing for a month.
 */
export async function getTalukaMap(district: string, taluka: string): Promise<TalukaMap> {
  const villages = await getVillages("7/12", district, taluka);
  const limit = pLimit(FAN_OUT);
  let failed = 0;
  const placed = await Promise.all(
    villages.map((v) =>
      limit(async (): Promise<PlacedVillage | null> => {
        try {
          const gisCode = bhunakshaCode(district, taluka, v.value);
          const bounds = await villageBounds(gisCode);
          return bounds && { code: v.value, gisCode, name: v.label, bounds };
        } catch {
          failed++;
          return null;
        }
      }),
    ),
  );
  return { villages: placed.filter((v) => v !== null), complete: failed === 0 };
}

/**
 * The plot at a point, searched for in `hint` first (the village being looked
 * at) and then in every village of the taluka whose extent holds the point —
 * extents overlap at the edges, so the smallest goes first.
 */
export async function getPlotAt(
  district: string,
  taluka: string,
  at: [number, number],
  hint: string | null,
): Promise<PlotPick> {
  const tried = new Set<string>();
  const tryVillage = async (code: string): Promise<PlotPick | null> => {
    tried.add(code);
    const map = await villageMap(district, taluka, code);
    if (!map || !contains(map.bounds, at)) return null;
    const number = await bhunaksha.plotAt(map, at);
    return number ? { code, village: map, plot: await plot(map.gisCode, number) } : null;
  };

  if (hint) {
    const hit = await tryVillage(hint);
    if (hit) return hit;
  }
  const { villages } = await getTalukaMap(district, taluka);
  const candidates = villages
    .filter((v) => !tried.has(v.code) && contains(v.bounds, at))
    .sort((a, b) => area(a.bounds) - area(b.bounds));
  for (const v of candidates) {
    const hit = await tryVillage(v.code);
    if (hit) return hit;
  }
  return { code: null, village: null, plot: null };
}

const area = (b: Bounds) => (b[2] - b[0]) * (b[3] - b[1]);
