"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RECORD_LABELS, recordHref } from "@/lib/search-params";
import {
  addressOf,
  collection,
  lookupFor,
  titleOf,
  viewOf,
  type Entry,
} from "@/lib/collection";
import { COLLECTION_PARAM, decodeCollection } from "@/lib/collection-link";
import { errorMessage } from "@/lib/client";
import { Failure } from "@/components/Status";

/**
 * One saved record as a link to it.
 *
 * Under a village heading the place would only repeat it, so the second line
 * says instead which survey or khata a nickname stands for, and a record with
 * no name of its own is titled by its address ("Survey 88") rather than a bare
 * number.
 */
export function SavedRow({ entry }: { entry: Entry }) {
  const named = !!(entry.nickname?.trim() || entry.name);
  const title = named ? titleOf(entry) : addressOf(entry);
  const detail = named ? addressOf(entry) : null;
  return (
    <Link className="saved-row" href={recordHref(lookupFor(entry))}>
      <span className="saved-row-title" lang="mr">
        {title}
      </span>
      {detail && (
        <span className="saved-row-path" lang="mr">
          {detail}
        </span>
      )}
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
