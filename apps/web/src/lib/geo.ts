import type { Bounds } from "@bhumi/core";

/** Below this zoom the village drawings are not shown, and plots cannot be picked. */
export const DETAIL_ZOOM = 13;

/** `[lng, lat]` at the middle of a box. */
export const centreOf = ([w, s, e, n]: Bounds): [number, number] => [(w + e) / 2, (s + n) / 2];

export const contains = ([w, s, e, n]: Bounds, [x, y]: readonly [number, number]): boolean =>
  x >= w && x <= e && y >= s && y <= n;

/** The box around several boxes. */
export const unionOf = (boxes: Bounds[]): Bounds =>
  boxes.reduce<Bounds>(
    (u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );

/** Square metres → guntha; 40 guntha make an acre. */
const SQM_PER_GUNTHA = 101.17;

/**
 * "0.33 ha · 32 guntha", "8.32 ha · 20 acre 22 guntha": hectares because the
 * 7/12 records area in them, acres and guntha because that is how land is
 * spoken of in Maharashtra.
 */
export function formatArea(sqm: number): string {
  const ha = `${(sqm / 10_000).toFixed(2)} ha`;
  const guntha = Math.round(sqm / SQM_PER_GUNTHA);
  const acres = Math.floor(guntha / 40);
  const rest = guntha % 40;
  const spoken = [acres && `${acres} acre`, (rest || !acres) && `${rest} guntha`]
    .filter(Boolean)
    .join(" ");
  return `${ha} · ${spoken}`;
}

/** Google Maps directions to the middle of a box. */
export function directionsHref(bounds: Bounds): string {
  const [lng, lat] = centreOf(bounds);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
