"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryStates } from "nuqs";
import type { Bounds, Option } from "@bhumi/core";
import { api } from "@/lib/client";
import { mapParams } from "@/lib/map-params";
import { useResource, dataOf, firstError } from "@/lib/resource";
import { DETAIL_ZOOM, centreOf, contains, unionOf } from "@/lib/geo";
import type { Place } from "@/lib/collection";
import type { TreeSnapshot } from "@/lib/tree";
import { Combobox } from "@/components/Combobox";
import { PlotCard } from "@/components/PlotCard";
import type { Camera, DrawnVillage, VillageLabel } from "@/components/MapCanvas";

// MapLibre touches `window` as it loads, so it never renders on the server.
const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="explore-canvas skeleton" />,
});

/** The register the map belongs to: Bhunaksha draws the rural, 7/12 villages. */
const RT = "7/12" as const;

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Plot numbers in the order a reader expects: 2 before 10, 10 before 10/1. */
const byNumber = new Intl.Collator("en", { numeric: true }).compare;

interface Target extends Camera {
  key: string;
}

/**
 * The map, as a way in.
 *
 * Search starts from a number someone already knows. This starts from the
 * ground: pick a taluka and every mapped village in it is laid over satellite
 * imagery, so land can be found by what it looks like and where it is — the
 * field by the river, the plot next to a cousin's. A tap on a field names its
 * survey number and who holds it, and opens onto its 7/12 and the holders'
 * 8As. Walking across a village line just keeps working.
 *
 * The URL holds the place and the plot, so wherever the map has been taken is
 * a link. Choices push history; the camera does not, or Back would replay
 * every pan.
 */
export function Explorer({ initial }: { initial: TreeSnapshot }) {
  const [sp, setSp] = useQueryStates(mapParams, { history: "push" });
  const { district, taluka, village, plot: plotNo } = sp;

  // --- The place, from the same cached tree the search screen uses ----------
  const districtsRes = useResource(`d|${RT}`, () => api.districts(RT), initial.districts);
  const talukasRes = useResource(
    district ? `t|${RT}|${district}` : null,
    () => api.talukas(RT, district!),
    initial.talukas,
  );
  const villagesRes = useResource(
    district && taluka ? `v|${RT}|${district}|${taluka}` : null,
    () => api.villages(RT, district!, taluka!),
    initial.villages,
  );
  const districts = dataOf(districtsRes) ?? [];
  const talukas = dataOf(talukasRes) ?? [];
  const villages = dataOf(villagesRes) ?? [];

  // --- What Bhunaksha draws -------------------------------------------------
  const talukaRes = useResource(
    district && taluka ? `mt|${district}|${taluka}` : null,
    () => api.talukaMap(district!, taluka!),
  );
  const villageRes = useResource(
    district && taluka && village ? `mv|${district}|${taluka}|${village}` : null,
    () => api.villagePlots(district!, taluka!, village!),
  );
  const plotRes = useResource(
    district && taluka && village && plotNo ? `m|${district}|${taluka}|${village}|${plotNo}` : null,
    () => api.parcelMap(district!, taluka!, village!, plotNo!),
  );
  const talukaMap = dataOf(talukaRes);
  const villageMap = dataOf(villageRes)?.village ?? null;
  const plot = dataOf(plotRes)?.plot ?? null;

  const drawn = useMemo<DrawnVillage[]>(() => {
    const list: DrawnVillage[] = talukaMap?.villages ?? [];
    // The chosen village is drawn before the rest of the taluka is placed.
    return villageMap && !list.some((v) => v.gisCode === villageMap.gisCode) ? [...list, villageMap] : list;
  }, [talukaMap, villageMap]);

  const labels = useMemo<VillageLabel[]>(
    () =>
      (talukaMap?.villages ?? []).map((v) => ({
        code: v.code,
        name: v.name,
        at: centreOf(v.bounds),
        current: v.code === village,
      })),
    [talukaMap, village],
  );

  const plotOptions = useMemo<Option[]>(
    () => [...(dataOf(villageRes)?.plots ?? [])].sort(byNumber).map((n) => ({ value: n, label: n })),
    [villageRes],
  );

  // --- The camera -----------------------------------------------------------
  // It follows the narrowest thing chosen: the plot, else the village, else the
  // taluka. A choice made *on* the map is the exception — the reader is already
  // looking at it — so those mark their target `quiet` and the map stays put.

  const target = useMemo<Target | null>(() => {
    if (plotNo && plotRes.status !== "ready") return null;
    if (plot) return { key: `p|${village}|${plot.number}`, bounds: plot.bounds, maxZoom: 18 };
    if (village) return villageMap && { key: `v|${village}`, bounds: villageMap.bounds, maxZoom: 16 };
    if (talukaMap?.villages.length) {
      const bounds = unionOf(talukaMap.villages.map((v) => v.bounds));
      return { key: `t|${district}|${taluka}`, bounds, maxZoom: 14 };
    }
    return null;
  }, [plotNo, plotRes.status, plot, village, villageMap, talukaMap, district, taluka]);

  const [camera, setCamera] = useState<Camera | null>(null);
  const aimed = useRef<string | null>(null);
  const quiet = useRef<string | null>(null);
  useEffect(() => {
    if (!target || target.key === aimed.current) return;
    aimed.current = target.key;
    if (quiet.current === target.key) {
      quiet.current = null;
      return;
    }
    setCamera({ bounds: target.bounds, maxZoom: target.maxZoom });
  }, [target]);

  // --- Picking on the map ---------------------------------------------------
  const [zoom, setZoom] = useState(0);
  const [pending, setPending] = useState<[number, number] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pickSeq = useRef(0);

  // A note is about the last tap; a new place makes it stale.
  useEffect(() => setNote(null), [district, taluka, village, plotNo]);

  async function pick(at: [number, number], z: number) {
    if (!district || !taluka) return;
    if (z < DETAIL_ZOOM) {
      // Too far out to tell fields apart: a tap chooses the village.
      const hit = (talukaMap?.villages ?? [])
        .filter((v) => contains(v.bounds, at))
        .sort((a, b) => spread(a.bounds) - spread(b.bounds))[0];
      if (hit) void setSp({ village: hit.code, plot: null });
      return;
    }
    const seq = ++pickSeq.current;
    setPending(at);
    setNote(null);
    try {
      const found = await api.plotAt(district, taluka, village, at);
      if (seq !== pickSeq.current) return;
      if (found.code && found.plot) {
        if (found.code !== village || found.plot.number !== plotNo) {
          quiet.current = `p|${found.code}|${found.plot.number}`;
        }
        void setSp({ village: found.code, plot: found.plot.number });
      } else {
        setNote("No survey number is drawn there.");
      }
    } catch (e) {
      if (seq === pickSeq.current) setNote(msg(e));
    } finally {
      if (seq === pickSeq.current) setPending(null);
    }
  }

  const close = () => {
    // Closing the card is not a request to zoom out.
    quiet.current = `v|${village}`;
    void setSp({ plot: null });
  };

  useEffect(() => {
    if (!plotNo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement).closest("input, textarea, select")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On a phone the card sits under the map; bring it up when a plot arrives.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (plot && matchMedia("(max-width: 899px)").matches) {
      card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [plot]);

  // --- Choices --------------------------------------------------------------
  const onDistrict = (value: string) => setSp({ district: value, taluka: null, village: null, plot: null });
  const onTaluka = (value: string) => setSp({ taluka: value, village: null, plot: null });
  const onVillage = (value: string) => setSp({ village: value, plot: null });
  const onPlot = (value: string) => setSp({ plot: value });

  const labelOf = (opts: Option[], v: string | null) => opts.find((o) => o.value === v)?.label ?? null;
  const villageName =
    labelOf(villages, village) ?? talukaMap?.villages.find((v) => v.code === village)?.name ?? village;

  const place: Place | null =
    district && taluka && village
      ? {
          district,
          taluka,
          village,
          districtName: labelOf(districts, district) ?? district,
          talukaName: labelOf(talukas, taluka) ?? taluka,
          villageName: villageName ?? village,
        }
      : null;

  const path = [labelOf(districts, district), labelOf(talukas, taluka), village && villageName]
    .filter(Boolean)
    .join(" › ");

  const mapped = talukaMap?.villages.length ?? 0;
  const unmappedVillage = villageRes.status === "ready" && !villageMap;
  const notDrawn = plotRes.status === "ready" && !plot;

  const hint = !taluka
    ? "Choose a district and taluka to lay its village maps over the imagery."
    : pending
      ? "Finding the survey number…"
      : note
        ? note
        : talukaRes.status === "loading" && !villageMap
          ? "Placing the taluka’s villages… the first visit takes a few seconds."
          : talukaMap && mapped === 0 && !villageMap
            ? "Bhunaksha has no georeferenced maps for this taluka yet."
            : plot
              ? null
              : zoom < DETAIL_ZOOM
                ? "Tap a village, or zoom in to pick a field."
                : "Tap a field to see its survey number and holders.";

  const error = firstError(districtsRes, talukasRes, villagesRes, talukaRes, villageRes, plotRes);

  return (
    <div className="explore">
      <div className="explore-panel">
        <header className="masthead">
          <Link href="/" className="wordmark wordmark-link">
            Bhumi
          </Link>
          <span className="source">Bhunaksha</span>
        </header>

        <section className="step" aria-labelledby="explore-title">
          <div className="step-head">
            <h1 className="step-title" id="explore-title">
              Map
            </h1>
            {path && (
              <p className="step-note" lang="mr">
                {path}
              </p>
            )}
          </div>

          <div className="row">
            <div className="field">
              <label className="lbl" htmlFor="m-district">
                District
              </label>
              <Combobox
                id="m-district"
                options={districts}
                value={district}
                onChange={onDistrict}
                placeholder="District"
                loading={districtsRes.status === "loading"}
                disabled={districts.length === 0}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="m-taluka">
                Taluka
              </label>
              <Combobox
                id="m-taluka"
                options={talukas}
                value={taluka}
                onChange={onTaluka}
                placeholder="Taluka"
                loading={talukasRes.status === "loading"}
                disabled={!district || talukasRes.status === "loading"}
              />
            </div>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="m-village">
              Village
            </label>
            <Combobox
              id="m-village"
              options={villages}
              value={village}
              onChange={onVillage}
              placeholder={mapped ? `Village — ${mapped} mapped` : "Village"}
              loading={villagesRes.status === "loading"}
              disabled={!taluka || villagesRes.status === "loading"}
            />
            {unmappedVillage && (
              <p className="help">Bhunaksha has no georeferenced map for this village yet.</p>
            )}
          </div>

          {village && villageMap && (
            <div className="field">
              <label className="lbl" htmlFor="m-plot">
                Survey number
              </label>
              <Combobox
                id="m-plot"
                options={plotOptions}
                value={plot?.number ?? plotNo}
                onChange={onPlot}
                placeholder={plotOptions.length ? `${plotOptions.length} drawn — type to find` : "Survey number"}
                loading={villageRes.status === "loading"}
                disabled={plotOptions.length === 0}
              />
              {notDrawn && <p className="help">Survey {plotNo} is not drawn on this village’s map.</p>}
            </div>
          )}
        </section>

        <div ref={card} className="explore-card">
          {plot && place ? (
            <PlotCard place={place} plot={plot} onClose={close} />
          ) : plotRes.status === "loading" ? (
            <div className="plot-skeleton" aria-busy="true">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : (
            <p className="help explore-intro">
              Satellite imagery with each village’s survey map drawn over it. Tap a field to see its
              survey number and who holds it, then open its 7/12. Maps are Bhunaksha’s and cover the
              villages it has georeferenced.
            </p>
          )}
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="explore-map">
        <MapCanvas
          className="explore-canvas"
          villages={drawn}
          plot={plot}
          camera={camera}
          labels={labels}
          pending={pending}
          onPick={(at, z) => void pick(at, z)}
          onLabel={onVillage}
          onZoom={setZoom}
          label={place ? `Map of ${place.villageName}` : "Map of Maharashtra"}
        />
        {hint && (
          <p className="map-hint" role="status">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

const spread = (b: Bounds) => (b[2] - b[0]) * (b[3] - b[1]);
