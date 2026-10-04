/**
 * A client for Mahabhunakasha (mahabhunakasha.mahabhumi.gov.in), the state's
 * cadastral map — the drawing behind the 7/12.
 *
 * Mahabhulekh says who holds a survey number and how much land it is;
 * Bhunaksha says where it is. The two share Maharashtra's village codes (the
 * same 18 digits, `272500020303060000`), so a village chosen in one cascade
 * addresses the other without a lookup table.
 *
 * Unlike Mahabhulekh this is a stateless REST + WMS service. The only state is
 * a cookie its firewall sets on first contact: every first request comes back
 * as a 302 to itself with that cookie attached, and only the retry is served.
 *
 * Coverage is partial. Only villages whose map has been georeferenced can be
 * placed on the earth, and the service answers an empty list for the rest —
 * which {@link BhunakshaClient.village} reports as `null`, not as an error.
 */

import type { MultiPolygon, Polygon, Position } from "geojson";
import { wktToGeoJSON } from "betterknown";
import proj4 from "proj4";
import { bhunakshaCode, type Bounds, type MapPlot, type VillageMap } from "./map.js";
import { MahabhulekhError } from "./types.js";
import { portalFetch } from "./tls.js";

const DEFAULT_BASE_URL = "https://mahabhunakasha.mahabhumi.gov.in/";
/** Bhunaksha serves every state from one deployment; Maharashtra is 27. */
const STATE = "27";

export interface BhunakshaOptions {
  baseUrl?: string;
  /** Injected for testing; defaults to {@link portalFetch}. */
  fetchImpl?: typeof fetch;
  /** Per-request ceiling, in ms. Defaults to 30s. */
  timeoutMs?: number;
}

export class BhunakshaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private cookie = "";

  constructor(opts: BhunakshaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? portalFetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** The village's map, or `null` when Bhunaksha has no georeferenced map for it. */
  async village(district: string, taluka: string, village: string): Promise<VillageMap | null> {
    const gisCode = bhunakshaCode(district, taluka, village);
    const extent = await this.rest<Extent | []>("rest/MapInfo/getVVVVExtentGeoref", {
      state: STATE,
      giscode: gisCode,
      srs: "4326",
    });
    if (Array.isArray(extent) || !isExtent(extent)) return null;
    return { gisCode, bounds: [extent.xmin, extent.ymin, extent.xmax, extent.ymax] };
  }

  /** Every plot number drawn on the village map. */
  async plotNumbers(gisCode: string): Promise<string[]> {
    const numbers = await this.rest<unknown>("rest/VillageMapService/kidelistFromGisCodeMH", {
      state: STATE,
      logedLevels: gisCode,
    });
    return Array.isArray(numbers) ? numbers.map(String) : [];
  }

  /** One plot's boundary, or `null` when the village map has no such plot. */
  async plot(gisCode: string, number: string): Promise<MapPlot | null> {
    const info = await this.rest<PlotInfo | null>("rest/MapInfo/getPlotInfo", {
      state: STATE,
      giscode: gisCode,
      plotno: number,
      srs: "4326",
    });
    if (!info?.plotid || !info.the_geom) return null;
    // The geometry comes back in the map's own UTM metres whatever `srs` asks
    // for; only the extent endpoint answers in degrees. That extent is what
    // says which UTM zone the village was drawn in.
    const extent = await this.rest<Extent>("rest/MapInfo/getExtentGeoref", {
      state: STATE,
      giscode: gisCode,
      plotid: info.plotid,
      srs: "4326",
    });
    const projected = wktToGeoJSON(info.the_geom);
    if (!isExtent(extent) || !projected) return null;
    if (projected.type !== "Polygon" && projected.type !== "MultiPolygon") return null;

    const toWgs84 = utmToWgs84([info.xmin, info.ymin, info.xmax, info.ymax], extent);
    const geometry = mapPositions(projected, toWgs84);
    return {
      number: info.plotno ?? number,
      areaSqm: info.area ?? 0,
      bounds: boundsOf(geometry),
      geometry,
    };
  }

  /**
   * A rendering of the village map — every plot's outline and number on a
   * transparent ground, drawn for laying over imagery — for one Web Mercator
   * tile. `bbox` is in EPSG:3857 metres.
   */
  async villageImage(gisCode: string, bbox: Bounds, size = 256): Promise<ArrayBuffer> {
    const query = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1",
      REQUEST: "GetMap",
      FORMAT: "image/png",
      TRANSPARENT: "true",
      LAYERS: "VILLAGE_MAP",
      STYLES: "",
      state: STATE,
      gis_code: gisCode,
      SRS: "EPSG:3857",
      WIDTH: String(size),
      HEIGHT: String(size),
      BBOX: bbox.join(","),
    });
    const res = await this.request(`WMS?${query}`, { method: "GET" });
    if (!res.headers.get("content-type")?.startsWith("image/")) {
      throw new MahabhulekhError("Bhunaksha did not return a map image.", [], true);
    }
    return res.arrayBuffer();
  }

  private async rest<T>(path: string, fields: Record<string, string>): Promise<T> {
    const res = await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    try {
      return (await res.json()) as T;
    } catch {
      throw new MahabhulekhError("Bhunaksha returned an unexpected answer.", [], true);
    }
  }

  /**
   * One request through the firewall. A 302 carrying a cookie is the firewall
   * handing one out; the same request is then repeated with it. The cookie is
   * kept, so later requests go straight through until it lapses.
   */
  private async request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(new URL(path, this.baseUrl), {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Cookie: this.cookie },
          redirect: "manual",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        throw new MahabhulekhError(
          timedOut
            ? "Bhunaksha did not respond in time. Please try again."
            : "Could not reach Bhunaksha. The map service may be down; please try again shortly.",
          [String((err as Error)?.message ?? err)],
          true,
        );
      }
      if (res.status < 300 || res.status >= 400) {
        if (res.ok) return res;
        throw new MahabhulekhError("Bhunaksha returned a server error. Please try again.", [], true);
      }
      const cookie = readCookies(res);
      if (!cookie) break;
      this.cookie = cookie;
    }
    throw new MahabhulekhError("Bhunaksha refused the request. Please try again.", [], true);
  }
}

/** A bounding box as the REST endpoints spell it. */
interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

interface PlotInfo extends Extent {
  plotid?: string;
  plotno?: string;
  area?: number;
  /** WKT in the village map's UTM zone, metres. */
  the_geom?: string;
}

const isExtent = (e: unknown): e is Extent =>
  !!e &&
  typeof e === "object" &&
  ["xmin", "ymin", "xmax", "ymax"].every((k) => typeof (e as Record<string, unknown>)[k] === "number");

function readCookies(res: Response): string {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return raw
    .map((c) => c.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

/**
 * The converter from the village's UTM zone to WGS84.
 *
 * Maharashtra straddles zones 43 and 44, and a map near the 78°E seam may have
 * been drawn in either, so the zone is not computed from longitude alone: each
 * neighbouring zone is tried on the plot's UTM extent, and the one that lands
 * on the extent the service reports in degrees wins.
 */
function utmToWgs84(utm: Bounds, degrees: Extent): (p: Position) => Position {
  const lng = (degrees.xmin + degrees.xmax) / 2;
  const lat = (degrees.ymin + degrees.ymax) / 2;
  const guess = Math.floor((lng + 180) / 6) + 1;
  const centre: Position = [(utm[0] + utm[2]) / 2, (utm[1] + utm[3]) / 2];

  let best: { zone: number; miss: number } | null = null;
  for (const zone of [guess - 1, guess, guess + 1]) {
    const [x, y] = proj4(utmDef(zone), "WGS84", centre) as [number, number];
    const miss = Math.hypot(x - lng, y - lat);
    if (!best || miss < best.miss) best = { zone, miss };
  }
  const convert = proj4(utmDef(best!.zone), "WGS84");
  return (p) => convert.forward([p[0]!, p[1]!]);
}

const utmDef = (zone: number) => `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;

function mapPositions(g: Polygon | MultiPolygon, f: (p: Position) => Position): Polygon | MultiPolygon {
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(f)) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.map(f))) };
}

function boundsOf(g: Polygon | MultiPolygon): Bounds {
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  const b: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of rings.flat() as [number, number][]) {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  }
  return b;
}
