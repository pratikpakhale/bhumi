"use client";

import { useEffect, useRef, useState } from "react";
import {
  FullscreenControl,
  GeolocateControl,
  Map as MapLibre,
  Marker,
  NavigationControl,
  ScaleControl,
  getVersion,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Bounds, MapPlot } from "@bhumi/core";
import { DETAIL_ZOOM } from "@/lib/geo";

/**
 * Satellite imagery under Bhunaksha's village drawings.
 *
 * Imagery is the point: a gat number becomes a field you can recognise — the
 * bund, the well, the road it fronts. Each village's drawing goes on top as
 * Bhunaksha renders it for exactly this (outlines and numbers on a transparent
 * ground), and the chosen plot is drawn as a vector so it stays crisp at any
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

/** From here the drawings carry the place, and village names step aside. */
const LABELS_HIDE_ZOOM = 14;

/** The state, for a map with nothing chosen yet. */
const MAHARASHTRA: Bounds = [72.6, 15.6, 80.9, 22.1];

const PLOT_LAYERS = ["plot-fill", "plot-halo", "plot-line"];
const CADASTRE = "cad-";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: [IMAGERY],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    plot: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "plot-fill", type: "fill", source: "plot", paint: { "fill-color": INK, "fill-opacity": 0.22 } },
    {
      id: "plot-halo",
      type: "line",
      source: "plot",
      paint: { "line-color": PAPER, "line-width": 5, "line-opacity": 0.9 },
    },
    { id: "plot-line", type: "line", source: "plot", paint: { "line-color": INK, "line-width": 2.5 } },
  ],
};

/** A village whose drawing is shown. */
export interface DrawnVillage {
  gisCode: string;
  bounds: Bounds;
}

/** A village name set on the map, which picks the village when tapped. */
export interface VillageLabel {
  code: string;
  name: string;
  at: [number, number];
  current: boolean;
}

/** Where to look. A new object moves the map, even to the same place. */
export interface Camera {
  bounds: Bounds;
  maxZoom: number;
}

export interface MapCanvasProps {
  villages: DrawnVillage[];
  /** Outlined over the drawings. */
  plot: MapPlot | null;
  camera: Camera | null;
  /** The map's accessible name. */
  label: string;
  labels?: VillageLabel[];
  /** A tap on the map, as `[lng, lat]`, with the zoom it was made at. */
  onPick?: (at: [number, number], zoom: number) => void;
  onLabel?: (code: string) => void;
  onZoom?: (zoom: number) => void;
  /** A point being looked up, marked until the answer arrives. */
  pending?: [number, number] | null;
  /**
   * For a map inside a scrolling page: one finger scrolls the page, two move
   * the map, and a wheel needs a modifier — no scroll is ever swallowed.
   */
  cooperative?: boolean;
  className?: string;
}

export default function MapCanvas({
  villages,
  plot,
  camera,
  label,
  labels,
  onPick,
  onLabel,
  onZoom,
  pending,
  cooperative = false,
  className = "map-canvas",
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibre | null>(null);

  // Handlers are read through a ref so the map is built once, not per render.
  const on = useRef({ onPick, onLabel, onZoom });
  on.current = { onPick, onLabel, onZoom };
  const pickable = !!onPick;

  // The camera the map was built with is already applied.
  const shown = useRef<Camera | null>(camera);

  useEffect(() => {
    const el = container.current!;
    const m = new MapLibre({
      container: el,
      style: STYLE,
      bounds: camera?.bounds ?? MAHARASHTRA,
      fitBoundsOptions: { padding: 48, maxZoom: camera?.maxZoom ?? 18 },
      maxZoom: 20,
      cooperativeGestures: cooperative,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new FullscreenControl(), "top-right");
    // For the reader standing in the field: where they are against the boundary.
    m.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      "top-right",
    );
    m.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    const zoomed = () => {
      const z = m.getZoom();
      el.dataset.detail = String(z >= LABELS_HIDE_ZOOM);
      on.current.onZoom?.(z);
    };
    m.on("zoomend", zoomed);
    m.on("click", (e) => on.current.onPick?.([e.lngLat.lng, e.lngLat.lat], m.getZoom()));
    m.on("load", () => {
      zoomed();
      setMap(m);
    });
    return () => {
      setMap(null);
      m.remove();
    };
    // Built once; every prop below is applied to the live map by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = pickable ? "pointer" : "";
  }, [map, pickable]);

  // One raster source per village: Bhunaksha draws a village per request, and
  // each source's bounds keep it from asking for tiles outside its village.
  useEffect(() => {
    if (!map) return;
    const wanted = new Map(villages.map((v) => [CADASTRE + v.gisCode, v]));
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith(CADASTRE) && !wanted.has(layer.id)) {
        map.removeLayer(layer.id);
        map.removeSource(layer.id);
      }
    }
    for (const [id, v] of wanted) {
      if (map.getSource(id)) continue;
      map.addSource(id, {
        type: "raster",
        tiles: [`${location.origin}/api/map/${v.gisCode}/{z}/{x}/{y}`],
        tileSize: 256,
        minzoom: DETAIL_ZOOM,
        maxzoom: 20,
        bounds: v.bounds,
        attribution: "Village maps © Bhunaksha, Government of Maharashtra",
      });
      // Under the plot outline, which must stay on top of every drawing.
      map.addLayer({ id, type: "raster", source: id }, PLOT_LAYERS[0]);
    }
  }, [map, villages]);

  useEffect(() => {
    (map?.getSource("plot") as GeoJSONSource | undefined)?.setData(
      plot
        ? { type: "Feature", geometry: plot.geometry, properties: {} }
        : { type: "FeatureCollection", features: [] },
    );
  }, [map, plot]);

  useEffect(() => {
    if (!map || !camera || camera === shown.current) return;
    shown.current = camera;
    map.fitBounds(camera.bounds, { padding: 48, maxZoom: camera.maxZoom });
  }, [map, camera]);

  // Names are DOM markers rather than a symbol layer: the browser shapes
  // Devanagari properly, and a marker is a real, focusable button.
  useEffect(() => {
    if (!map || !labels) return;
    const markers = labels.map((l) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-label";
      el.lang = "mr";
      el.textContent = l.name;
      if (l.current) el.setAttribute("aria-current", "true");
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        on.current.onLabel?.(l.code);
      });
      return new Marker({ element: el }).setLngLat(l.at).addTo(map);
    });
    return () => markers.forEach((mk) => mk.remove());
  }, [map, labels]);

  useEffect(() => {
    if (!map || !pending) return;
    const el = document.createElement("div");
    el.className = "map-pending";
    const marker = new Marker({ element: el }).setLngLat(pending).addTo(map);
    return () => void marker.remove();
  }, [map, pending]);

  return <div ref={container} className={className} role="region" aria-label={label} />;
}
