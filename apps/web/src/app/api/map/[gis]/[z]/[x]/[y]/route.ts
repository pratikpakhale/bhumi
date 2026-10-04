import { bhunaksha } from "@/lib/parcel-map";

/**
 * One Web Mercator tile of a village map, drawn by Bhunaksha's WMS.
 *
 * Proxied rather than linked: the service sits behind a cookie-issuing
 * firewall and sends no CORS headers, and a map canvas can draw neither. Tiles
 * are addressed `z/x/y`, so the same tile is the same URL for every visitor
 * and the CDN answers all but the first.
 *
 * Zoom is held to the range where a cadastral drawing is legible, which also
 * keeps this from being a general-purpose proxy.
 */

const MIN_ZOOM = 12;
const MAX_ZOOM = 21;
/** Half the Web Mercator world's width, in metres. */
const HALF = Math.PI * 6378137;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gis: string; z: string; x: string; y: string }> },
) {
  const { gis, z: zs, x: xs, y: ys } = await params;
  const [z, x, y] = [zs, xs, ys].map(Number) as [number, number, number];
  const span = 2 ** z;
  if (
    !/^RVM\d{10,}$/.test(gis) ||
    ![z, x, y].every(Number.isInteger) ||
    z < MIN_ZOOM ||
    z > MAX_ZOOM ||
    x < 0 ||
    y < 0 ||
    x >= span ||
    y >= span
  ) {
    return new Response("Not a map tile", { status: 400 });
  }

  const size = (2 * HALF) / span;
  const west = -HALF + x * size;
  const north = HALF - y * size;
  try {
    const png = await bhunaksha.villageImage(gis, [west, north - size, west + size, north]);
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000",
      },
    });
  } catch {
    // A missing tile leaves a gap in the overlay; the imagery stays usable.
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
