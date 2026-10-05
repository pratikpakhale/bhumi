"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { lookupKey } from "@/lib/search-params";
import {
  collection,
  lookupFor,
  placeOf,
  titleOf,
  useCollection,
  type Entry,
  type Removed,
} from "@/lib/collection";
import { collectionUrl } from "@/lib/collection-link";
import { copyIndex, forgetAllCopies } from "@/lib/copies";
import { forgetAll as forgetRecents } from "@/lib/recents";
import { renewMobile, storedMobile } from "@/lib/record-request";
import { shareLink } from "@/lib/share";
import { errorMessage } from "@/lib/client";
import { SavedRow } from "@/components/Collection";
import { SkeletonRows } from "@/components/Status";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";

/** How long a toast — and with it Undo after a removal — stays up. */
const TOAST_MS = 10_000;

const noSubscribe = () => () => {};

/** False until hydration is over, so a list not yet read is never shown as empty. */
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Everything this device keeps, and the controls over it.
 *
 * The list is the user's own: renamed, ordered and pruned by them, moved to
 * another phone by link or file. Below it is the rest of what Bhumi stores
 * here — offline copies, remembered places, the number sent to the portal —
 * each with its own way to clear it, because "it stays on your device" is only
 * a promise if the device's owner can see and empty it.
 */
export function SavedScreen() {
  const entries = useCollection();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // One toast at a time, fixed to the screen: a note from the bulk bar at the
  // top of a long list would otherwise land below it, out of sight.
  const [toast, setToast] = useState<{ text: string; removed?: Removed[] } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function say(text: string, removed?: Removed[]) {
    clearTimeout(toastTimer.current);
    setToast({ text, removed });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  const [offline, setOffline] = useState<{ keys: Set<string>; bytes: number } | null>(null);
  useEffect(() => {
    void copyIndex().then(setOffline);
  }, []);

  const shown = match(entries, filter);
  const groups = byVillage(shown);
  // Read through what is on screen, so neither a removed entry nor one the
  // filter hides is acted on unseen.
  const chosen = shown.filter((e) => selected.has(e.id));
  const allChosen = shown.length > 0 && chosen.length === shown.length;
  const isOffline = (e: Entry) => !!offline?.keys.has(lookupKey(lookupFor(e)));

  function remove(ids: string[]) {
    const removed = collection.forget(ids);
    if (!removed.length) return;
    // Dropped from the selection too, so Undo does not bring them back ticked.
    setSelected((was) => new Set([...was].filter((id) => !ids.includes(id))));
    say(removed.length === 1 ? `Removed ${titleOf(removed[0]!.entry)}` : `Removed ${removed.length} records`, removed);
  }

  async function share(list: Entry[]) {
    try {
      const how = await shareLink("Saved land records — Bhumi", await collectionUrl(list));
      if (how === "copied") say("Link copied. Anyone who opens it can add these to their own list.");
      if (how === "failed") say("Could not copy the link.");
    } catch {
      say("Could not make a link for these records.");
    }
  }

  function exportFile(list: Entry[]) {
    const blob = new Blob([JSON.stringify(collection.toFile(list), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bhumi-saved-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        <div className="intro">
          <h1 className="intro-title">Saved records</h1>
          <p className="lede">Kept on this device only. Open one, rename it, or send the list to another phone.</p>
        </div>

        {!hydrated ? (
          <SkeletonRows />
        ) : entries.length === 0 ? (
          <div className="empty">
            <p>Nothing saved yet. Find a record and press Save; it will be here, ready to open — even offline.</p>
            <div className="step-actions">
              <Link className="btn btn-primary" href="/">
                Find a record
              </Link>
              <ImportButton onDone={say} />
            </div>
          </div>
        ) : (
          <section className="saved" aria-labelledby="saved-list-title">
            <h2 className="sr-only" id="saved-list-title">
              Your list
            </h2>
            <div className="saved-bar">
              <input
                className="inp"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name, village or number"
                aria-label="Filter saved records"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditing((on) => !on);
                  setSelected(new Set());
                }}
              >
                {editing ? "Done" : "Edit"}
              </button>
            </div>

            {editing && (
              <div className="saved-select" role="group" aria-label="With selected">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={allChosen}
                    ref={(box) => {
                      if (box) box.indeterminate = chosen.length > 0 && !allChosen;
                    }}
                    onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((x) => x.id)) : new Set())}
                  />
                  {chosen.length ? `${chosen.length} selected` : "Select all"}
                </label>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!chosen.length} onClick={() => void share(chosen)}>
                  Share
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!chosen.length} onClick={() => exportFile(chosen)}>
                  Export
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!chosen.length}
                  onClick={() => remove(chosen.map((e) => e.id))}
                >
                  Remove
                </button>
              </div>
            )}

            {shown.length === 0 && <p className="help">Nothing saved matches “{filter.trim()}”.</p>}
            {editing && shown.length > 0 && !!filter.trim() && <p className="help">Clear the filter to reorder.</p>}

            {editing ? (
              <ul className="saved-list">
                {shown.map((entry) => (
                  <EditRow
                    key={entry.id}
                    entry={entry}
                    index={entries.indexOf(entry)}
                    total={entries.length}
                    // Moving within a filtered list would skip rows the user cannot see.
                    canMove={!filter.trim()}
                    selected={selected.has(entry.id)}
                    onSelect={(on) =>
                      setSelected((was) => {
                        const next = new Set(was);
                        if (on) next.add(entry.id);
                        else next.delete(entry.id);
                        return next;
                      })
                    }
                    onRemove={() => remove([entry.id])}
                  />
                ))}
              </ul>
            ) : (
              groups.map(([village, list]) => (
                <div key={village} className="saved-group">
                  {groups.length > 1 && (
                    <h3 className="saved-group-title" lang="mr">
                      {village}
                    </h3>
                  )}
                  <ul className="saved-list">
                    {list.map((entry) => (
                      <li key={entry.id}>
                        <SavedRow entry={entry} offline={isOffline(entry)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            <div className="step-actions">
              <button type="button" className="btn btn-ghost" onClick={() => void share(entries)}>
                Share list
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => exportFile(entries)}>
                Export file
              </button>
              <ImportButton onDone={say} />
            </div>
          </section>
        )}

        <DeviceData
          offline={offline}
          onClearCopies={async () => {
            try {
              await forgetAllCopies();
            } catch {
              say("Could not clear the offline copies.");
            }
            setOffline(await copyIndex());
          }}
        />
      </main>

      {/* Mounted for the page's life so every new toast is announced. */}
      <div role="status">
        {toast && (
          <div className="toast">
            <span>{toast.text}</span>
            {toast.removed && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  collection.restore(toast.removed!);
                  clearTimeout(toastTimer.current);
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}

/** Rename, reorder, select and remove. Reorder is buttons, not drag: keyboard-reachable. */
function EditRow({
  entry,
  index,
  total,
  canMove,
  selected,
  onSelect,
  onRemove,
}: {
  entry: Entry;
  index: number;
  total: number;
  canMove: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onRemove: () => void;
}) {
  const name = entry.name || entry.code;
  return (
    <li className="saved-edit" data-selected={selected || undefined}>
      {/* The label is the 44px target around a 20px box. */}
      <label className="saved-edit-check">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select ${titleOf(entry)}`}
        />
      </label>
      <div className="saved-edit-main">
        <input
          className="inp"
          defaultValue={entry.nickname ?? ""}
          placeholder={name}
          aria-label={`Your name for ${name}`}
          lang="mr"
          onBlur={(e) => collection.update(entry.id, { nickname: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="saved-row-path" lang="mr">
          {placeOf(entry)}
        </span>
      </div>
      <div className="saved-edit-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canMove || index === 0}
          aria-label={`Move ${titleOf(entry)} up`}
          onClick={() => collection.move(entry.id, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canMove || index === total - 1}
          aria-label={`Move ${titleOf(entry)} down`}
          onClick={() => collection.move(entry.id, index + 1)}
        >
          ↓
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${titleOf(entry)}`} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

function ImportButton({ onDone }: { onDone: (note: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    try {
      const { added, skipped } = collection.merge(collection.fromFile(await file.text()));
      onDone(
        added === 0
          ? "Everything in that file is already saved."
          : `Added ${added}${skipped ? `; ${skipped} were already saved` : ""}.`,
      );
    } catch (e) {
      onDone(errorMessage(e));
    }
  }
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
        Import file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
    </>
  );
}

/** What else Bhumi keeps on this device, each with a way to clear it. */
function DeviceData({
  offline,
  onClearCopies,
}: {
  offline: { keys: Set<string>; bytes: number } | null;
  onClearCopies: () => Promise<void>;
}) {
  // undefined until read: the server cannot know, and "none" would be a guess.
  const [mobile, setMobile] = useState<string | null | undefined>(undefined);
  useEffect(() => setMobile(storedMobile()), []);
  const [recentsCleared, setRecentsCleared] = useState(false);

  return (
    <section className="device" aria-labelledby="device-title">
      <h2 className="step-title" id="device-title">
        On this device
      </h2>
      <ul className="device-list">
        <li className="device-item">
          <h3>Offline copies</h3>
          <p>
            {offline === null ? (
              <span className="skeleton skeleton-text skeleton-wide" role="img" aria-label="Checking" />
            ) : offline.keys.size === 0 ? (
              "None yet. Every record you open is kept, so it opens again without signal."
            ) : (
              `${offline.keys.size} ${offline.keys.size === 1 ? "record" : "records"}, ${size(offline.bytes)}`
            )}
          </p>
          {!!offline?.keys.size && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Clear offline copies"
              onClick={() => void onClearCopies()}
            >
              Clear
            </button>
          )}
        </li>
        <li className="device-item">
          <h3>Recent places</h3>
          <p>{recentsCleared ? "Cleared." : "Districts, talukas and villages you pick are offered first next time."}</p>
          {!recentsCleared && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Clear recent places"
              onClick={() => {
                forgetRecents();
                setRecentsCleared(true);
              }}
            >
              Clear
            </button>
          )}
        </li>
        <li className="device-item">
          <h3>Number sent to Mahabhulekh</h3>
          <p>
            {mobile === undefined ? (
              <span className="skeleton skeleton-text" role="img" aria-label="Checking" />
            ) : mobile ? (
              <>
                <span className="mono">{mobile}</span>.
              </>
            ) : (
              "Made when you first open a record."
            )}{" "}
            The portal asks for a mobile number but never checks it, so this one is random.
          </p>
          {mobile && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMobile(renewMobile())}>
              New number
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}

/** Match on everything a person might remember: a name, a place, or a number. */
function match(entries: Entry[], query: string): Entry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [titleOf(entry), entry.name ?? "", placeOf(entry), entry.code, ...(entry.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

/** Entries by village, villages in the order their first entry appears. */
function byVillage(entries: Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const name = placeOf(entry);
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  return [...groups];
}
