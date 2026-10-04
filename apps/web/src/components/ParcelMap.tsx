"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useResource } from "@/lib/resource";
import type { Place } from "@/lib/collection";

// MapLibre is most of a megabyte; only a page that is about to show a map pays for it.
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="map-canvas skeleton" />,
});

/**
 * Where the parcel on this 7/12 lies, from Bhunaksha.
 *
 * The record says what is held and by whom; this says which field it is. The
 * numbers come first and work without the map — the area, and directions to the
 * plot — while the map itself (and its imagery, heavy on mobile data) only
 * loads once the reader scrolls towards it.
 */
export function ParcelMap({ place, survey }: { place: Place; survey: string }) {
  const res = useResource(
    `m|${place.district}|${place.taluka}|${place.village}|${survey}`,
    () => api.parcelMap(place.district, place.taluka, place.village, survey),
  );
  const frame = useRef<HTMLDivElement>(null);
  const data = res.status === "ready" ? res.data : null;
  const near = useNearViewport(frame, !!data?.village);

  const plot = data?.plot ?? null;
  const centre = plot && [(plot.bounds[1] + plot.bounds[3]) / 2, (plot.bounds[0] + plot.bounds[2]) / 2];

  return (
    <section className="relation" aria-labelledby="rel-map">
      <div className="relation-head">
        <h2 className="lbl" id="rel-map">
          Map
        </h2>
        {centre && (
          <a
            className="btn btn-ghost"
            href={`https://www.google.com/maps/dir/?api=1&destination=${centre[0]!.toFixed(6)},${centre[1]!.toFixed(6)}`}
            target="_blank"
            rel="noreferrer"
          >
            Directions
          </a>
        )}
      </div>

      {res.status === "loading" && <div className="map-canvas skeleton" />}

      {res.status === "error" && (
        <p className="help" data-invalid="true">
          The map could not be loaded. {res.message}
        </p>
      )}

      {data && !data.village && (
        <p className="help">Bhunaksha has no georeferenced map for this village yet.</p>
      )}

      {data?.village && (
        <>
          <p className="map-facts">
            {plot ? (
              <>
                <span className="map-number">Survey {plot.number}</span>
                <span>{formatArea(plot.areaSqm)}</span>
              </>
            ) : (
              <span>Survey {survey} is not drawn on this village’s map.</span>
            )}
          </p>
          {plot && plot.number !== survey && (
            <p className="help">
              The map draws survey {plot.number} as one plot; {survey} lies within it.
            </p>
          )}
          <div ref={frame} className="map-frame">
            {near ? (
              <MapCanvas
                village={data.village}
                plot={plot}
                label={plot ? `Map of survey ${plot.number}, ${place.villageName}` : `Map of ${place.villageName}`}
              />
            ) : (
              <div className="map-canvas skeleton" />
            )}
          </div>
          <p className="help">
            Area is measured from the drawing and can differ from the 7/12. Bhunaksha maps are for
            viewing only, not for legal use.
          </p>
        </>
      )}
    </section>
  );
}

/** True once `ref` comes within a screen of the viewport; stays true. */
function useNearViewport(ref: React.RefObject<HTMLElement | null>, armed: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !armed || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, armed]);
  return near;
}

/** Square metres → guntha; 40 guntha make an acre. */
const SQM_PER_GUNTHA = 101.17;

/**
 * "0.33 ha · 32 guntha", "8.32 ha · 20 acre 22 guntha": hectares because the
 * 7/12 records area in them, acres and guntha because that is how land is
 * spoken of in Maharashtra.
 */
function formatArea(sqm: number): string {
  const ha = `${(sqm / 10_000).toFixed(2)} ha`;
  const guntha = Math.round(sqm / SQM_PER_GUNTHA);
  const acres = Math.floor(guntha / 40);
  const rest = guntha % 40;
  const spoken = [acres && `${acres} acre`, (rest || !acres) && `${rest} guntha`]
    .filter(Boolean)
    .join(" ");
  return `${ha} · ${spoken}`;
}
