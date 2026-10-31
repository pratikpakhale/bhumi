import type { Bounds } from "@bhumi/core";

/** Below this zoom the village drawings are not shown, and plots cannot be picked. */
export const DETAIL_ZOOM = 13;

/** `--accent-fg` from the dark theme: the ink colour lifted to read on imagery. */
export const INK = "#84a9f7";

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

const pinOf = (bounds: Bounds) => {
  const [lng, lat] = centreOf(bounds);
  return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
};

export function coordinatesOf(bounds: Bounds): string {
  const { lat, lng } = pinOf(bounds);
  return `${lat}, ${lng}`;
}

/** Google Maps directions to the middle of a box. */
export function directionsHref(bounds: Bounds): string {
  const { lat, lng } = pinOf(bounds);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function mapServiceLinks(bounds: Bounds, label: string): { name: string; href: string }[] {
  const { lat, lng } = pinOf(bounds);
  return [
    { name: "Google Maps", href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
    { name: "Apple Maps", href: `https://maps.apple.com/?${new URLSearchParams({ ll: `${lat},${lng}`, q: label })}` },
    { name: "Google Earth", href: `https://earth.google.com/web/search/${lat},${lng}` },
    { name: "OpenStreetMap", href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}` },
  ];
}

/** iPhone and iPad, including iPadOS, which reports itself as a Mac with a touch screen. */
export const prefersAppleMaps = (userAgent: string, touchPoints: number): boolean =>
  /iPhone|iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
