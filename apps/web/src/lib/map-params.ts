/**
 * The map explorer's place in the URL — taluka, village and the chosen plot —
 * so a field found by wandering the map is a link like any record.
 *
 * Codes are Mahabhulekh's 7/12 cascade, the same ones `/` and `/record` use, so
 * a plot on the map links straight to its documents. Parsers come from
 * `nuqs/server` so this is importable on both sides.
 */

import { createLoader, parseAsString } from "nuqs/server";

export const mapParams = {
  district: parseAsString,
  taluka: parseAsString,
  village: parseAsString,
  /** A plot number as the village map draws it — `131`, not `131/1/अ`. */
  plot: parseAsString,
};

export const loadMapParams = createLoader(mapParams);

/** A link into the explorer. */
export function mapHref(at: {
  district: string;
  taluka: string;
  village?: string | null;
  plot?: string | null;
}): string {
  const params = new URLSearchParams({ district: at.district, taluka: at.taluka });
  if (at.village) params.set("village", at.village);
  if (at.village && at.plot) params.set("plot", at.plot);
  return `/map?${params}`;
}
