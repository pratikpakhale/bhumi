"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import type { MapPlot } from "@bhumi/core";
import type { Place } from "@/lib/collection";
import { coordinatesOf, mapServiceLinks } from "@/lib/geo";
import { outlineHref, plotGeoJson, plotKml } from "@/lib/plot-export";
import { copyText, saveFile } from "@/lib/share";

const ADVANCED_KEY = "bhumi_plot_menu_advanced";

export function PlotMenu({ place, plot, className }: { place: Place; plot: MapPlot; className: string }) {
  const id = useId();
  const anchor = `--${id.replace(/\W/g, "")}`;
  const menu = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    try {
      setAdvanced(localStorage.getItem(ADVANCED_KEY) === "1");
    } catch {}
  }, []);

  const coordinates = coordinatesOf(plot.bounds);
  const close = () => menu.current?.hidePopover();

  const copy = () =>
    void copyText(coordinates).then((ok) => {
      setCopied(ok);
      setTimeout(() => setCopied(null), 1600);
    });

  const toggleAdvanced = (open: boolean) => {
    setAdvanced(open);
    try {
      localStorage.setItem(ADVANCED_KEY, open ? "1" : "0");
    } catch {}
  };

  return (
    <>
      <button type="button" className={className} popoverTarget={id} style={{ anchorName: anchor }}>
        More
        <ChevronDown className="menu-chevron" size={14} aria-hidden="true" />
      </button>

      <div
        id={id}
        ref={menu}
        popover="auto"
        role="dialog"
        className="menu"
        style={{ positionAnchor: anchor }}
        aria-label={`More for survey ${plot.number}`}
      >
        <div className="menu-head">
          <span>
            Survey {plot.number}, <span lang="mr">{place.villageName}</span>
          </span>
          <button
            type="button"
            className="btn btn-ghost plot-close"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="menu-opt" onClick={copy}>
          <span className="menu-opt-text">
            Copy location
            <span className="menu-opt-meta menu-opt-number">{coordinates}</span>
          </span>
          <span className="menu-opt-hint" aria-live="polite">
            {copied === null ? "Copy" : copied ? "Copied" : "Could not copy"}
          </span>
        </button>

        {mapServiceLinks(plot.bounds, `Survey ${plot.number}, ${place.villageName}`).map(({ name, href }) => (
          <a key={name} className="menu-opt" href={href} target="_blank" rel="noreferrer" onClick={close}>
            Open in {name}
            <ArrowUpRight className="menu-opt-hint" size={14} aria-hidden="true" />
          </a>
        ))}

        <details className="menu-more" open={advanced} onToggle={(e) => toggleAdvanced(e.currentTarget.open)}>
          <summary className="menu-opt menu-summary">
            For surveyors and mapping apps
            <ChevronDown className="menu-chevron" size={14} aria-hidden="true" />
          </summary>

          <button
            type="button"
            className="menu-opt"
            onClick={() => {
              saveFile(plotKml(place, plot));
              close();
            }}
          >
            <span className="menu-opt-text">
              Boundary as KML
              <span className="menu-opt-meta">Google Earth, GPS, survey apps</span>
            </span>
            <span className="menu-opt-hint">Download</span>
          </button>
          <button
            type="button"
            className="menu-opt"
            onClick={() => {
              saveFile(plotGeoJson(place, plot));
              close();
            }}
          >
            <span className="menu-opt-text">
              Boundary as GeoJSON
              <span className="menu-opt-meta">QGIS and other GIS tools</span>
            </span>
            <span className="menu-opt-hint">Download</span>
          </button>
          <a className="menu-opt" href={outlineHref(place, plot)} target="_blank" rel="noreferrer" onClick={close}>
            <span className="menu-opt-text">
              View outline on geojson.io
              <span className="menu-opt-meta">The boundary drawn on a web map</span>
            </span>
            <ArrowUpRight className="menu-opt-hint" size={14} aria-hidden="true" />
          </a>
        </details>
      </div>
    </>
  );
}
