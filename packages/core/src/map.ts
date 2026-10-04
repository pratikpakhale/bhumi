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
  /** The UTM zone (northern hemisphere) the village was drawn in: 43 or 44. */
  utmZone: number;
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
  /** Who holds the land inside the plot, per 7/12 sub-division and khata. */
  holdings: PlotHolding[];
}

/**
 * One khata's share of a 7/12 sub-division, as Bhunaksha lists it for a plot.
 *
 * Bhunaksha reads this from the same land records the 7/12 is printed from, so
 * it names the sub-divisions a drawn plot covers — `131` is drawn once and held
 * as `131/1/अ`, `131/1/ब` and `131/2` — which is what links a shape on the map
 * back to the documents.
 */
export interface PlotHolding {
  /** The 7/12 survey number, e.g. `131/1/अ`. */
  survey: string;
  khata: string | null;
  /** In hectares, as the 7/12 records it. */
  areaHa: number | null;
  /** Uncultivable land (पोट खराबा) within it, in hectares. */
  potKharabaHa: number | null;
  owners: string[];
}

const HOLDING_FIELDS: Record<string, (h: PlotHolding, value: string) => void> = {
  "survey no.": (h, v) => (h.survey = v),
  "khata no.": (h, v) => (h.khata = v || null),
  "total area": (h, v) => (h.areaHa = hectares(v)),
  "pot kharaba": (h, v) => (h.potKharabaHa = hectares(v)),
  "owner name": (h, v) =>
    (h.owners = v
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)),
};

const hectares = (v: string): number | null => {
  const n = Number.parseFloat(normalizeDigits(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * The holdings in a plot's `info` text: `Key : Value` lines, one block per
 * khata, blocks separated by a rule of dashes. Unknown keys are skipped, so a
 * field Bhunaksha adds later costs nothing.
 */
export function parsePlotInfo(info: string): PlotHolding[] {
  const holdings: PlotHolding[] = [];
  for (const block of info.split(/^-{3,}\s*$/m)) {
    const h: PlotHolding = { survey: "", khata: null, areaHa: null, potKharabaHa: null, owners: [] };
    for (const line of block.split("\n")) {
      const at = line.indexOf(":");
      if (at < 0) continue;
      HOLDING_FIELDS[line.slice(0, at).trim().toLowerCase()]?.(h, line.slice(at + 1).trim());
    }
    if (h.survey) holdings.push(h);
  }
  return holdings;
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
