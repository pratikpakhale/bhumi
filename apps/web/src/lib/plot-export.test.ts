import { describe, expect, it } from "vitest";
import type { MapPlot } from "@bhumi/core";
import { coordinatesOf, mapServiceLinks, prefersAppleMaps } from "./geo";
import { outlineHref, plotGeoJson, plotKml } from "./plot-export";

const PLACE = {
  district: "35",
  taluka: "4",
  village: "272700020100630000",
  districtName: "Pune",
  talukaName: "Haveli",
  villageName: "आंबेगाव <बु>",
};

const square = [
  [73.85, 18.52],
  [73.86, 18.52],
  [73.86, 18.53],
  [73.85, 18.53],
  [73.85, 18.52],
];

const PLOT: MapPlot = {
  number: "1/B",
  areaSqm: 12_345.6,
  bounds: [73.85, 18.52, 73.86, 18.53],
  geometry: { type: "Polygon", coordinates: [square] },
  holdings: [],
};

describe("map service links", () => {
  it("pins the middle of the plot, latitude first", () => {
    expect(coordinatesOf(PLOT.bounds)).toBe("18.525000, 73.855000");
    for (const { href } of mapServiceLinks(PLOT.bounds, "Survey 1/B")) {
      expect(href).toContain("18.525000");
      expect(href.indexOf("18.525000")).toBeLessThan(href.indexOf("73.855000"));
    }
  });

  it("encodes the label for services that show one", () => {
    const apple = mapServiceLinks(PLOT.bounds, "Survey 1/B, आंबेगाव").find((l) => l.name === "Apple Maps")!;
    expect(new URL(apple.href).searchParams.get("q")).toBe("Survey 1/B, आंबेगाव");
  });
});

describe("plot files", () => {
  it("names files without the slashes plot numbers carry", () => {
    expect(plotKml(PLACE, PLOT).name).toBe("survey-1-B-आंबेगाव-बु.kml");
    expect(plotGeoJson(PLACE, PLOT).name).toMatch(/^survey-1-B-.*\.geojson$/);
  });

  it("writes the boundary as KML, longitude first, with text escaped", () => {
    const { text } = plotKml(PLACE, PLOT);
    expect(text).toContain("<coordinates>73.85,18.52 73.86,18.52 73.86,18.53 73.85,18.53 73.85,18.52</coordinates>");
    expect(text).toContain("<name>Survey 1/B, आंबेगाव &lt;बु&gt;</name>");
    expect(text).not.toContain("MultiGeometry");
    expect(text).toContain("map?district=35&amp;taluka=4");
  });

  it("keeps every part and hole of a multipolygon", () => {
    const hole = square.map(([x, y]) => [x! + 0.001, y! + 0.001]);
    const { text } = plotKml(PLACE, {
      ...PLOT,
      geometry: { type: "MultiPolygon", coordinates: [[square, hole], [square]] },
    });
    expect(text).toContain("<MultiGeometry>");
    expect(text.match(/<Polygon>/g)).toHaveLength(2);
    expect(text.match(/<innerBoundaryIs>/g)).toHaveLength(1);
  });

  it("writes a GeoJSON feature carrying the geometry as drawn", () => {
    const feature = JSON.parse(plotGeoJson(PLACE, PLOT).text);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry).toEqual(PLOT.geometry);
    expect(feature.properties).toMatchObject({ survey: "1/B", village: "आंबेगाव <बु>", areaSqm: 12_346 });
  });
});

describe("outline link", () => {
  it("carries the boundary to geojson.io in the hash", () => {
    const href = outlineHref(PLACE, PLOT);
    const prefix = "https://geojson.io/#data=data:application/json,";
    expect(href.startsWith(prefix)).toBe(true);
    const data = decodeURIComponent(href.slice(prefix.length));
    expect(data).not.toContain("&");
    expect(JSON.parse(data).geometry).toEqual(PLOT.geometry);
  });
});

describe("which map app leads", () => {
  it("is Apple Maps on iPhone and iPad, Google Maps elsewhere", () => {
    expect(prefersAppleMaps("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(prefersAppleMaps("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(prefersAppleMaps("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(prefersAppleMaps("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });
});
