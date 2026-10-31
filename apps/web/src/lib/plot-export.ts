import type { MapPlot } from "@bhumi/core";
import type { Place } from "./collection";
import { INK, formatArea } from "./geo";
import { mapHref } from "./map-params";
import { SITE } from "./site";

interface PlotFile {
  name: string;
  type: string;
  text: string;
}

type Ring = number[][];

const titleOf = (place: Place, plot: MapPlot) => `Survey ${plot.number}, ${place.villageName}`;

const linkOf = (place: Place, plot: MapPlot) => SITE.url + mapHref({ ...place, plot: plot.number });

const NOT_IN_FILE_NAMES = /[\s/\\:*?"<>|]+/g;

const baseName = (place: Place, plot: MapPlot) =>
  `survey-${plot.number}-${place.villageName}`.replace(NOT_IN_FILE_NAMES, "-").replace(/^-|-$/g, "");

const kmlColour = (hex: string, alpha: string) => alpha + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);

const xml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export function plotKml(place: Place, plot: MapPlot): PlotFile {
  const polygons = plot.geometry.type === "Polygon" ? [plot.geometry.coordinates] : plot.geometry.coordinates;
  const ring = (r: Ring) =>
    `<LinearRing><coordinates>${r.map(([lng, lat]) => `${lng},${lat}`).join(" ")}</coordinates></LinearRing>`;
  const polygon = ([outer, ...holes]: Ring[]) =>
    `<Polygon><outerBoundaryIs>${ring(outer!)}</outerBoundaryIs>${holes
      .map((h) => `<innerBoundaryIs>${ring(h)}</innerBoundaryIs>`)
      .join("")}</Polygon>`;
  const shapes = polygons.map(polygon).join("");
  const description = [
    formatArea(plot.areaSqm),
    `${place.talukaName}, ${place.districtName}`,
    "Boundary from Bhunaksha, for viewing only, not for legal use.",
    linkOf(place, plot),
  ].join("\n");

  const text = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${xml(titleOf(place, plot))}</name>
<Style id="plot"><LineStyle><color>${kmlColour(INK, "ff")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColour(INK, "38")}</color></PolyStyle></Style>
<Placemark>
<name>${xml(titleOf(place, plot))}</name>
<description>${xml(description)}</description>
<styleUrl>#plot</styleUrl>
${polygons.length > 1 ? `<MultiGeometry>${shapes}</MultiGeometry>` : shapes}
</Placemark>
</Document>
</kml>
`;
  return { name: `${baseName(place, plot)}.kml`, type: "application/vnd.google-earth.kml+xml", text };
}

export function plotGeoJson(place: Place, plot: MapPlot): PlotFile {
  const feature = {
    type: "Feature",
    properties: {
      name: titleOf(place, plot),
      survey: plot.number,
      village: place.villageName,
      taluka: place.talukaName,
      district: place.districtName,
      areaSqm: Math.round(plot.areaSqm),
      source: "Bhunaksha, for viewing only, not for legal use",
      link: linkOf(place, plot),
    },
    geometry: plot.geometry,
  };
  return { name: `${baseName(place, plot)}.geojson`, type: "application/geo+json", text: JSON.stringify(feature, null, 2) };
}

export function outlineHref(place: Place, plot: MapPlot): string {
  const feature = {
    type: "Feature",
    properties: { name: titleOf(place, plot), area: formatArea(plot.areaSqm) },
    geometry: plot.geometry,
  };
  return `https://geojson.io/#data=data:application/json,${encodeURIComponent(JSON.stringify(feature))}`;
}
