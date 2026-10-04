/**
 * The pure half of the cadastral map: how a village and a survey number are
 * addressed on Bhunaksha, and the shapes it answers with. No network and no
 * Node APIs, so a browser can import it; the client is in `bhunaksha.ts`.
 */

import type { MultiPolygon, Polygon } from "geojson";
import { normalizeDigits } from "./eightA.js";

/** `[west, south, east, north]` in degrees, or metres for Web Mercator. */
export type Bounds = [number, number, number, number];

/** A georeferenced village map. */
export interface VillageMap {
  /** Bhunaksha's address for the village, see {@link bhunakshaCode}. */
  gisCode: string;
  /** The village's extent in WGS84 degrees. */
  bounds: Bounds;
}

/** One survey/gat number as drawn on the village map. */
export interface MapPlot {
  /** The plot number as Bhunaksha labels it, e.g. `105` or `1/B`. */
  number: string;
  /** Area of the drawn polygon in square metres. */
  areaSqm: number;
  /** Extent of {@link geometry}, in WGS84 degrees. */
  bounds: Bounds;
  /** The plot boundary in WGS84 (GeoJSON `[lng, lat]` order). */
  geometry: Polygon | MultiPolygon;
}

/**
 * Bhunaksha's code for a rural village: category `R` and map type `VM`, then
 * the district and taluka padded to two digits, then the village code itself.
 * Mahabhulekh's 7/12 cascade serves the same numbers unpadded (`5`, `2`).
 */
export function bhunakshaCode(district: string, taluka: string, village: string): string {
  return `RVM${district.padStart(2, "0")}${taluka.padStart(2, "0")}${village}`;
}

/**
 * The plot on the map that a 7/12 survey number falls in, or `null`.
 *
 * The map is usually drawn at the gat/survey level while 7/12s are kept per
 * sub-division, so `131/1/अ` is found as `131`. Each trailing part is dropped
 * in turn until a drawn plot matches, which keeps the most specific match
 * where the map does draw sub-divisions.
 */
export function matchPlot(survey: string, plotNumbers: readonly string[]): string | null {
  const drawn = new Set(plotNumbers.map((n) => n.trim()));
  const parts = normalizeDigits(survey)
    .split("/")
    .map((p) => p.trim());
  for (let n = parts.length; n > 0; n--) {
    const candidate = parts.slice(0, n).join("/");
    if (drawn.has(candidate)) return candidate;
  }
  return null;
}
