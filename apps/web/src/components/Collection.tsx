"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RECORD_LABELS, recordHref } from "@/lib/search-params";
import {
  collection,
  lookupFor,
  placeOf,
  titleOf,
  useCollection,
  viewOf,
  type Entry,
} from "@/lib/collection";
import { COLLECTION_PARAM, decodeCollection } from "@/lib/collection-link";
import { errorMessage } from "@/lib/client";
import { Failure } from "@/components/Status";

/** Rows the home screen offers before pointing at the Saved page. */
const SHORTLIST = 5;

/**
 * The first few saved records, on the search screen.
 *
 * For a returning user this list *is* the shortest path to a record, and the
 * search below it is the fallback for something they have not kept yet.
 * Managing the list — renaming, reordering, sharing — is the Saved page's job.
 */
export function SavedShortlist() {
  const entries = useCollection();
  if (entries.length === 0) return null;
  return (
    <section className="saved" aria-labelledby="saved-title">
      <div className="saved-head">
        <h2 className="step-title" id="saved-title">
          Your saved records
        </h2>
        <Link className="step-link" href="/saved">
          {entries.length > SHORTLIST ? `All ${entries.length}` : "Manage"}
        </Link>
      </div>
      <ul className="saved-list">
        {entries.slice(0, SHORTLIST).map((entry) => (
          <li key={entry.id}>
            <SavedRow entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One saved record as a link to it. */
export function SavedRow({ entry, offline }: { entry: Entry; offline?: boolean }) {
  return (
    <Link className="saved-row" href={recordHref(lookupFor(entry))}>
      <span className="saved-row-title" lang="mr">
        {titleOf(entry)}
      </span>
      {/* Offline sits with the place, not in the type pill, which on a phone
          would take the width the Marathi name needs. */}
      <span className="saved-row-path">
        <span lang="mr">{placeOf(entry)}</span>
        {offline && " · Offline copy"}
      </span>
      <span className="saved-row-type">{RECORD_LABELS[viewOf(entry)]}</span>
    </Link>
  );
}

/**
 * A collection arriving by link.
 *
 * Never merged on arrival — a link that silently rewrites the recipient's own
 * list is a link nobody can safely open. It says what it holds and waits.
 */
export function SharedCollection() {
  const token = useSearchParams().get(COLLECTION_PARAM);
  const [incoming, setIncoming] = useState<Entry[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void decodeCollection(token)
      .then((entries) => alive && setIncoming(entries))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [token]);

  // Not gated on `token`: Next syncs `replaceState` into useSearchParams, so
  // dropping the token would otherwise hide the note saying what was added.
  if (!incoming && !note && !error) return null;

  return (
    <section className="shared" aria-labelledby="shared-title">
      <h2 className="step-title" id="shared-title">
        Shared with you
        {incoming && <span className="count">{incoming.length}</span>}
      </h2>
      {error && <Failure message={error} />}
      {note && (
        <p className="help" role="status">
          {note}
        </p>
      )}
      {incoming && (
        <>
          <p className="shared-names" lang="mr">
            {incoming.slice(0, 6).map(titleOf).join(" · ")}
            {incoming.length > 6 && ` +${incoming.length - 6}`}
          </p>
          <div className="record-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const { added, skipped } = collection.merge(incoming);
                setIncoming(null);
                setNote(
                  added === 0
                    ? "Everything in that link is already saved."
                    : `Added ${added}${skipped ? `; ${skipped} were already saved` : ""}.`,
                );
                dropToken();
              }}
            >
              Add to mine
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIncoming(null);
                dropToken();
              }}
            >
              Not now
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Take the shared collection out of the address bar once it has been dealt
 * with, so a reload does not offer the same import again. Done through the
 * History API rather than a route push: nothing else on the page depends on
 * this param, and a navigation would discard the search state around it.
 */
function dropToken(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(COLLECTION_PARAM);
  window.history.replaceState(null, "", url.pathname + url.search);
}
