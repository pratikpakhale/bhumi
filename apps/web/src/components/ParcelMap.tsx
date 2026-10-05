"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useResource } from "@/lib/resource";
import { directionsHref, formatArea } from "@/lib/geo";
import { mapHref } from "@/lib/map-params";
import type { Place } from "@/lib/collection";

import type { Camera } from "./MapCanvas";
import { Failure, Loading } from "./Status";

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
  const drawn = useMemo(() => (data?.village ? [data.village] : []), [data?.village]);
  const camera = useMemo<Camera | null>(
    () => (data?.village ? { bounds: plot?.bounds ?? data.village.bounds, maxZoom: 17 } : null),
    [data?.village, plot],
  );

  return (
    <section className="relation" aria-labelledby="rel-map">
      <div className="relation-head">
        <h2 className="relation-title" id="rel-map">
          Where it is
        </h2>
        {data?.village && (
          <div className="relation-actions">
            <Link className="btn btn-ghost btn-sm" href={mapHref({ ...place, plot: plot?.number ?? null })}>
              Open in map
            </Link>
            {plot && (
              <a className="btn btn-ghost btn-sm" href={directionsHref(plot.bounds)} target="_blank" rel="noreferrer">
                Directions
              </a>
            )}
          </div>
        )}
      </div>

      {res.status === "loading" && (
        <>
          <Loading size="sm" label="Finding this survey number on Bhunaksha’s map…" />
          <div className="map-frame">
            <div className="map-canvas skeleton" />
          </div>
        </>
      )}

      {res.status === "error" && (
        <Failure message={`The map could not be loaded. ${res.message}`} onRetry={res.retryable ? res.retry : undefined} />
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
                villages={drawn}
                plot={plot}
                camera={camera}
                cooperative
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
