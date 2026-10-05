"use client";

import Link from "next/link";
import { useRef } from "react";
import { recordHref } from "@/lib/search-params";
import { SaveControl } from "./SaveControl";
import {
  collection,
  entryId,
  holdersOf,
  parcelLookup,
  holderLookup,
  titleOf,
  useCollection,
  type Place,
} from "@/lib/collection";

/**
 * The two directions between a person and their land.
 *
 * Neither costs a request. An 8A *is* the list of survey numbers held under a
 * khata, so reading one — which the user was going to do anyway — hands over
 * every 7/12 worth pulling, already addressed: a parcel is reached by its
 * number, so no search is needed to turn a listed number into a link.
 *
 * The reverse is the same edge read backwards. The portal cannot answer it at
 * all — a 7/12 is a scanned image, so nothing can be parsed out of it — but
 * every 8A already opened left its holdings on this device, which makes
 * "who holds this parcel" free, and answerable with no signal.
 */

/**
 * Every parcel a holder's 8A listed, each one a tap from its 7/12.
 *
 * Said in words rather than as a bare count of chips: "Land under this khata"
 * is what the list is, and a row that reads "Survey 10/3 · Open 7/12" says
 * what tapping it does.
 */
export function Holdings({
  place,
  numbers,
  lang,
}: {
  place: Place;
  numbers: string[];
  lang: string;
}) {
  const entries = useCollection();
  const title = useRef<HTMLHeadingElement>(null);
  if (numbers.length === 0) return null;
  const isSaved = (code: string) => entries.some((e) => e.id === entryId(place, "parcel", code));
  const unsaved = numbers.filter((code) => !isSaved(code));
  return (
    <section className="relation" aria-labelledby="rel-holdings">
      <div className="relation-head">
        {/* Focus lands here once "Save all" has done its job and gone. */}
        <h2 className="relation-title" id="rel-holdings" ref={title} tabIndex={-1}>
          Land under this khata<span className="count">{numbers.length}</span>
        </h2>
        {numbers.length > 1 && unsaved.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              for (const code of unsaved) collection.save({ kind: "parcel", code, place });
              title.current?.focus();
            }}
          >
            Save all {unsaved.length}
          </button>
        )}
      </div>
      <ul className="relation-list">
        {numbers.map((number) => (
          <li key={number}>
            <Link className="relation-row" href={recordHref(parcelLookup(place, number), lang)}>
              <span>Survey {number}</span>
              <span className="relation-go">Open 7/12</span>
            </Link>
            <SaveControl
              subject={{ kind: "parcel", code: number, place }}
              className="btn btn-ghost btn-sm"
              label={`survey ${number}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every holder in the collection whose 8A listed this parcel. */
export function HeldBy({ place, number, lang }: { place: Place; number: string; lang: string }) {
  const holders = holdersOf(useCollection(), place, number);
  if (holders.length === 0) return null;
  return (
    <section className="relation" aria-labelledby="rel-heldby">
      <div className="relation-head">
        <h2 className="relation-title" id="rel-heldby">
          Held by, from 8As you have opened<span className="count">{holders.length}</span>
        </h2>
      </div>
      <ul className="chips">
        {holders.map((holder) => (
          <li key={holder.id}>
            <Link
              className="chip"
              lang="mr"
              href={recordHref(holderLookup(place, holder.code), lang)}
            >
              {titleOf(holder)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
