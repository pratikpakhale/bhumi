"use client";

import Link from "next/link";
import { useState } from "react";
import type { MapPlot, PlotHolding } from "@bhumi/core";
import { holderLookup, normalizeCode, parcelLookup, type Place } from "@/lib/collection";
import { recordHref, searchHref } from "@/lib/search-params";
import { directionsHref, formatArea } from "@/lib/geo";
import { shareLink } from "@/lib/share";
import { SaveControl } from "./SaveControl";

/**
 * A plot picked on the map, and what the land records say about it.
 *
 * Records open in a new tab: the map is the place being explored, and coming
 * back to it should not mean finding the field again.
 *
 * Bhunaksha draws a survey number once and the 7/12s are kept per
 * sub-division, so the plot opens onto its sub-divisions, each a link to its
 * 7/12, and under each the khatas holding it, each a link to its 8A. Everything
 * shown comes with the plot; a document is fetched only when one is opened.
 */
export function PlotCard({
  place,
  plot,
  onClose,
}: {
  place: Place;
  plot: MapPlot;
  onClose: () => void;
}) {
  const surveys = bySurvey(plot.holdings);

  return (
    <section aria-labelledby="plot-title">
      <div className="plot-head">
        <div className="plot-heading">
          <h2 className="step-title plot-title" id="plot-title">
            Survey {plot.number}
          </h2>
          <p className="plot-place">
            <span lang="mr">{place.villageName}</span> · {formatArea(plot.areaSqm)}
          </p>
        </div>
        <button type="button" className="btn btn-ghost plot-close" onClick={onClose} aria-label={`Close survey ${plot.number}`}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="plot-actions">
        <a className="btn btn-ghost" href={directionsHref(plot.bounds)} target="_blank" rel="noreferrer">
          Directions
        </a>
        <ShareLink title={`Survey ${plot.number}, ${place.villageName}`} />
      </div>

      {surveys.length > 0 ? (
        <ul className="plot-surveys">
          {surveys.map(({ survey, holdings }) => (
            <li key={survey} className="plot-survey">
              <div className="plot-survey-head">
                <span className="plot-survey-number">{survey}</span>
                <span className="plot-survey-actions">
                  <Link
                    className="btn btn-ghost btn-sm"
                    href={recordHref(parcelLookup(place, survey))}
                    target="_blank"
                    aria-label={`7/12 of survey ${survey}`}
                  >
                    7/12
                  </Link>
                  <SaveControl
                    subject={{ kind: "parcel", code: normalizeCode(survey), place, register: "7/12" }}
                    className="btn btn-ghost btn-sm"
                    label={`survey ${survey}`}
                  />
                </span>
              </div>
              <ul className="results-list">
                {holdings.map((h, i) => (
                  <li key={`${h.khata}|${i}`}>
                    <Holding place={place} holding={h} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="help">
          Bhunaksha lists no holders for this plot.{" "}
          <Link href={searchHref(parcelLookup(place, plot.number))} target="_blank">Search 7/12 for {plot.number}</Link>
        </p>
      )}

      <p className="help">
        Holders as Bhunaksha lists them; the 7/12 is the record. Area is measured from the drawing.
        Bhunaksha maps are for viewing only, not for legal use.
      </p>
    </section>
  );
}

function Holding({ place, holding: h }: { place: Place; holding: PlotHolding }) {
  const facts = [
    h.khata && `Khata ${h.khata}`,
    h.areaHa !== null && `${h.areaHa} ha`,
    !!h.potKharabaHa && `${h.potKharabaHa} ha pot kharaba`,
  ].filter(Boolean);
  const text = (
    <span className="results-text">
      <span lang="mr">{h.owners.join(", ") || "—"}</span>
      <span className="results-meta">{facts.join(" · ")}</span>
    </span>
  );
  // A khata is an 8A: the holder's whole account in the village.
  return h.khata ? (
    <Link className="results-row" href={recordHref(holderLookup(place, h.khata))} target="_blank">
      {text}
    </Link>
  ) : (
    <span className="results-row">{text}</span>
  );
}

/** The URL holds the place and the plot, so the address is the link to share. */
function ShareLink({ title }: { title: string }) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() =>
        void shareLink(title, location.href).then((how) => {
          if (how === "shared") return;
          setNote(how === "copied" ? "Link copied" : "Could not copy");
          setTimeout(() => setNote(null), 1600);
        })
      }
    >
      <span aria-live="polite">{note ?? "Share"}</span>
    </button>
  );
}

/** Holdings grouped under their sub-division, in the order Bhunaksha gave them. */
function bySurvey(holdings: PlotHolding[]): { survey: string; holdings: PlotHolding[] }[] {
  const groups = new Map<string, PlotHolding[]>();
  for (const h of holdings) groups.set(h.survey, [...(groups.get(h.survey) ?? []), h]);
  return [...groups].map(([survey, hs]) => ({ survey, holdings: hs }));
}
