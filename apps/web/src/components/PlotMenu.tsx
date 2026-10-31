"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { MapPlot } from "@bhumi/core";
import type { Place } from "@/lib/collection";
import { coordinatesOf, mapServiceLinks, prefersAppleMaps } from "@/lib/geo";
import { outlineHref, plotGeoJson, plotKml } from "@/lib/plot-export";
import { copyText, saveFile } from "@/lib/share";

const ADVANCED_KEY = "bhumi_plot_menu_advanced";

const noSubscribe = () => () => {};

export function PlotMenu({ place, plot, className }: { place: Place; plot: MapPlot; className: string }) {
  const id = useId();
  const anchor = `--${id.replace(/\W/g, "")}`;
  const menu = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const apple = useSyncExternalStore(
    noSubscribe,
    () => prefersAppleMaps(navigator.userAgent, navigator.maxTouchPoints),
    () => false,
  );

  useEffect(() => {
    try {
      setAdvanced(localStorage.getItem(ADVANCED_KEY) === "1");
    } catch {}
  }, []);

  const title = `Survey ${plot.number}, ${place.villageName}`;
  const coordinates = coordinatesOf(plot.bounds);
  const links = mapServiceLinks(plot.bounds, title);
  const main = links.find((l) => l.name === (apple ? "Apple Maps" : "Google Maps"))!;
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
        <Chevron />
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
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <a className="menu-opt" href={main.href} target="_blank" rel="noreferrer" onClick={close}>
          <span className="menu-opt-text">
            Open in {main.name}
            <span className="menu-opt-meta">See this spot on the map</span>
          </span>
          <ExternalIcon />
        </a>
        <button type="button" className="menu-opt" onClick={copy}>
          <span className="menu-opt-text">
            Copy location
            <span className="menu-opt-meta menu-opt-number">{coordinates}</span>
          </span>
          <span className="menu-opt-hint" aria-live="polite">
            {copied === null ? "Copy" : copied ? "Copied" : "Could not copy"}
          </span>
        </button>

        <details className="menu-more" open={advanced} onToggle={(e) => toggleAdvanced(e.currentTarget.open)}>
          <summary className="menu-opt menu-summary">
            For surveyors and mapping apps
            <Chevron />
          </summary>

          <MenuGroup label="Boundary">
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
              <ExternalIcon />
            </a>
          </MenuGroup>

          <MenuGroup label="Pin in">
            {links
              .filter((l) => l !== main)
              .map(({ name, href }) => (
                <a key={name} className="menu-opt" href={href} target="_blank" rel="noreferrer" onClick={close}>
                  {name}
                  <ExternalIcon />
                </a>
              ))}
          </MenuGroup>
        </details>
      </div>
    </>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <p className="menu-group" id={id}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Chevron() {
  return (
    <svg className="menu-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="menu-opt-hint" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 2.5h5.5V8M9.5 2.5 2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
