"use client";

import Link from "next/link";
import { recordHref } from "@/lib/search-params";
import {
  collection,
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

/** Every parcel a holder's 8A listed. */
export function Holdings({
  place,
  numbers,
  lang,
}: {
  place: Place;
  numbers: string[];
  lang: string;
}) {
  if (numbers.length === 0) return null;
  return (
    <section className="relation" aria-labelledby="rel-holdings">
      <div className="relation-head">
        <h2 className="lbl" id="rel-holdings">
          Holdings<span className="count">{numbers.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            for (const code of numbers) collection.save({ kind: "parcel", code, place });
          }}
        >
          Save all
        </button>
      </div>
      <ul className="chips">
        {numbers.map((number) => (
          <li key={number}>
            <Link className="chip" href={recordHref(parcelLookup(place, number), lang)}>
              {number}
            </Link>
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
        <h2 className="lbl" id="rel-heldby">
          Held by<span className="count">{holders.length}</span>
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
