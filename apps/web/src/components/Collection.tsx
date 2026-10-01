"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { recordHref } from "@/lib/search-params";
import {
  collection,
  lookupFor,
  placeOf,
  titleOf,
  useCollection,
  viewOf,
  type Entry,
} from "@/lib/collection";
import { COLLECTION_PARAM, collectionUrl, decodeCollection } from "@/lib/collection-link";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * The collection, as the first thing on the page.
 *
 * Not a drawer and not a tab: for a returning user this list *is* the shortest
 * path to a record, and the search below it is the fallback for a subject they
 * have not kept yet.
 */
export function Collection() {
  const entries = useCollection();
  const [editing, setEditing] = useState(false);

  if (entries.length === 0) return null;

  return (
    <section className="saved" aria-labelledby="saved-title">
      <div className="saved-head">
        <h2 className="step-title" id="saved-title">
          Saved<span className="count">{entries.length}</span>
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={editing}
          onClick={() => setEditing((on) => !on)}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <ul className="saved-list">
        {entries.map((entry, i) => (
          <li key={entry.id}>
            {editing ? (
              <EditRow entry={entry} index={i} total={entries.length} />
            ) : (
              <Link className="saved-row" href={recordHref(lookupFor(entry))}>
                <span className="saved-row-title" lang="mr">
                  {titleOf(entry)}
                </span>
                <span className="saved-row-path" lang="mr">
                  {placeOf(entry)}
                </span>
                <span className="saved-row-type">{viewOf(entry)}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {editing && <Tools />}
    </section>
  );
}

/** Rename, reorder and remove. Reorder is buttons, not drag: keyboard-reachable. */
function EditRow({ entry, index, total }: { entry: Entry; index: number; total: number }) {
  return (
    <div className="saved-edit">
      <input
        className="inp"
        defaultValue={entry.nickname ?? ""}
        placeholder={titleOf(entry)}
        aria-label={`Name for ${titleOf(entry)}`}
        onBlur={(e) => collection.update(entry.id, { nickname: e.target.value })}
      />
      <div className="saved-edit-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={index === 0}
          aria-label="Move up"
          onClick={() => collection.move(entry.id, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={index === total - 1}
          aria-label="Move down"
          onClick={() => collection.move(entry.id, index + 1)}
        >
          ↓
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => collection.forget(entry.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}

/**
 * Getting the collection off this device, and back onto another one.
 *
 * A file is the backup; a link is the transfer. Both carry the same payload —
 * subjects and names — and neither carries the saved copies, which are
 * megabytes of image and personal to the device that gathered them.
 */
function Tools() {
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function share() {
    try {
      await navigator.clipboard.writeText(await collectionUrl());
      setNote("Link copied");
    } catch (e) {
      setNote(msg(e));
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(collection.toFile(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bhumi-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function importFile(file: File) {
    try {
      const { added, skipped } = collection.merge(collection.fromFile(await file.text()));
      setNote(`Added ${added}, skipped ${skipped}`);
    } catch (e) {
      setNote(msg(e));
    }
  }

  return (
    <div className="saved-tools">
      <div className="record-actions">
        <button type="button" className="btn btn-ghost" onClick={() => void share()}>
          Copy link
        </button>
        <button type="button" className="btn btn-ghost" onClick={exportFile}>
          Export
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      {note && (
        <p className="help" role="status">
          {note}
        </p>
      )}
    </div>
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

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void decodeCollection(token)
      .then((entries) => alive && setIncoming(entries))
      .catch((e) => alive && setNote(msg(e)));
    return () => {
      alive = false;
    };
  }, [token]);

  if (!token || (!incoming && !note)) return null;

  return (
    <section className="shared" aria-labelledby="shared-title">
      <h2 className="step-title" id="shared-title">
        Shared with you
        {incoming && <span className="count">{incoming.length}</span>}
      </h2>
      {note && <p className="help">{note}</p>}
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
                setNote(`Added ${added}, skipped ${skipped}`);
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
