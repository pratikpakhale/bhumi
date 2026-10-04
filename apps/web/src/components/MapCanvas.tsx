"use client";

import { useEffect, useRef } from "react";
import {
  FullscreenControl,
  GeolocateControl,
  Map as MapLibre,
  NavigationControl,
  ScaleControl,
  getVersion,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapPlot, VillageMap } from "@bhumi/core";

/**
 * Satellite imagery under Bhunaksha's village drawing.
 *
 * Imagery is the point: a gat number becomes a field you can recognise — the
 * bund, the well, the road it fronts. The village drawing goes on top as
 * Bhunaksha renders it for exactly this (outlines and numbers on a transparent
 * ground), and the parcel itself is drawn as a vector so it stays crisp at any
 * zoom.
 *
 * Map colours are not themed: like the record frame, this is a picture of the
 * ground, and the outline has to read against imagery rather than against the
 * page. Hex, because the style spec does not take OKLCH.
 */

// Copied into `public/` by scripts/maplibre-worker.mjs, which explains why.
setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

/** `--accent-fg` from the dark theme: the ink colour lifted to read on imagery. */
const INK = "#84a9f7";
/** `--paper`. */
const PAPER = "#fdfbfa";

const IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function styleFor(village: VillageMap, plot: MapPlot | null): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: [IMAGERY],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      },
      cadastre: {
        type: "raster",
        tiles: [`${location.origin}/api/map/${village.gisCode}/{z}/{x}/{y}`],
        tileSize: 256,
        minzoom: 12,
        maxzoom: 20,
        // Only this village is drawn, so no tile is asked for outside it.
        bounds: village.bounds,
        attribution: "Village map © Bhunaksha, Government of Maharashtra",
      },
      ...(plot && {
        plot: {
          type: "geojson",
          data: { type: "Feature", geometry: plot.geometry, properties: {} },
        },
      }),
    },
    layers: [
      { id: "imagery", type: "raster", source: "imagery" },
      { id: "cadastre", type: "raster", source: "cadastre" },
      ...(plot
        ? ([
            {
              id: "plot-fill",
              type: "fill",
              source: "plot",
              paint: { "fill-color": INK, "fill-opacity": 0.22 },
            },
            {
              id: "plot-halo",
              type: "line",
              source: "plot",
              paint: { "line-color": PAPER, "line-width": 5, "line-opacity": 0.9 },
            },
            {
              id: "plot-line",
              type: "line",
              source: "plot",
              paint: { "line-color": INK, "line-width": 2.5 },
            },
          ] as const)
        : []),
    ],
  };
}

export default function MapCanvas({
  village,
  plot,
  label,
}: {
  village: VillageMap;
  plot: MapPlot | null;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibre({
      container: container.current,
      style: styleFor(village, plot),
      bounds: plot?.bounds ?? village.bounds,
      fitBoundsOptions: { padding: 48, maxZoom: 18 },
      maxZoom: 20,
      // The map sits in a scrolling page: one finger scrolls the page, two move
      // the map, and a wheel needs a modifier — no scroll is ever swallowed.
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new FullscreenControl(), "top-right");
    // For the reader standing in the field: where they are against the boundary.
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    return () => map.remove();
  }, [village, plot]);

  return <div ref={container} className="map-canvas" role="region" aria-label={label} />;
}
