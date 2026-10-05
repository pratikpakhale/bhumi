"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseParcelLabel, type Option, type RecordType } from "@bhumi/core";
import { recordHref } from "@/lib/search-params";
import { collection, lookupFor, subjectOf, type Draft, type Place } from "@/lib/collection";
import { SaveControl } from "./SaveControl";

/** Rows rendered at once, and the largest set worth offering as one save. */
const LIMIT = 200;
const BULK = 60;

/**
 * What a search found, as things you can open.
 *
 * A row is not a form value to be selected and then submitted — it is the
 * document, one tap away. That is the whole reason the search screen no longer
 * has a third step: choosing a result *is* the request.
 *
 * A name search is also the cheapest way to build a collection: one round trip
 * returns everything a surname holds in the village, and keeping those costs
 * the portal nothing further, because a subject is an address and the documents
 * are pulled one at a time later.
 */
export function Results({
  place,
  type,
  options,
  lang,
  route,
}: {
  place: Place;
  type: RecordType;
  options: Option[];
  lang: string;
  /**
   * The search to repeat when opening a row, for sub-types a row's own number
   * cannot be found again by — akshari survey numbers are words, which the
   * number search does not match.
   */
  route?: { st: string; q: string };
}) {
  const [note, setNote] = useState<string | null>(null);
  // A new set of results is a new list; "Saved 12" was about the old one.
  useEffect(() => setNote(null), [options]);
  const subjects = options
    .map((option) => ({ option, subject: subjectOf(place, type, option) }))
    .filter((r): r is { option: Option; subject: Draft } => !!r.subject);

  if (subjects.length === 0) return null;

  // A loose number search can return four figures of rows; render a workable
  // slice and let the query do the narrowing.
  const shown = subjects.slice(0, LIMIT);
  const noun = type === "8A" ? "khata" : type === "PropertyCard" ? "CTS" : "survey";

  return (
    <div>
      <div className="results-head">
        <span className="lbl">
          {type === "8A" ? "Holders" : "Parcels"}
          <span className="count">{subjects.length}</span>
        </span>
        {subjects.length > 1 && subjects.length <= BULK && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              for (const { subject } of subjects) collection.save(subject);
              setNote(`Saved ${subjects.length}`);
            }}
          >
            Save all
          </button>
        )}
      </div>
      <ul className="results-list">
        {shown.map(({ option, subject }) => (
          <li key={option.value}>
            <Link className="results-row" href={recordHref(route ? { ...lookupFor(subject), ...route } : lookupFor(subject), lang)}>
              <Row type={type} label={option.label} />
            </Link>
            <SaveControl subject={subject} className="btn btn-ghost btn-sm" label={`${noun} ${subject.code}`} />
          </li>
        ))}
      </ul>
      {shown.length < subjects.length && (
        <p className="help">
          Showing the first {shown.length} of {subjects.length}. Type more to narrow the list.
        </p>
      )}
      {note && (
        <p className="help" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * A name-search row carries three things in one string —
 * `काशिनाथ तुकाराम गडदे ( 109 ) [ 23 ]` — so it is set as the holder's name with
 * the numbers beneath, which is what a reader scans a long list by.
 */
function Row({ type, label }: { type: RecordType; label: string }) {
  const { name, number, account } = parseParcelLabel(label);
  if (!name) return <span lang="mr">{label}</span>;
  const facts =
    type === "8A"
      ? [`Khata ${number}`]
      : [`${type === "PropertyCard" ? "CTS" : "Survey"} ${number}`, account && `Khata ${account}`];
  return (
    <span className="results-text">
      <span lang="mr">{name}</span>
      <span className="results-meta">{facts.filter(Boolean).join(" · ")}</span>
    </span>
  );
}
