"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  collection,
  placeOf,
  titleOf,
  useCollection,
  type Entry,
  type Removed,
} from "@/lib/collection";
import { collectionUrl } from "@/lib/collection-link";
import { shareLink } from "@/lib/share";
import { errorMessage } from "@/lib/client";
import { useAccount } from "@/lib/sync";
import { useHydrated } from "@/lib/hydrated";
import { Menu } from "@/components/Menu";
import { SavedRow } from "@/components/Collection";
import { SkeletonRows } from "@/components/Status";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";

/** How long a toast — and with it Undo after a removal — stays up. */
const TOAST_MS = 10_000;

/** Below this many, every record is in view and a search box is one more thing to read past. */
const FILTER_FROM = 7;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The saved records, and nothing else.
 *
 * Coming back to open a record is nearly every visit, so the records are the
 * page and open in one tap. Managing them (rename, reorder, remove) is behind
 * Edit; what is done with the whole list (send it, back it up, restore it) is
 * behind More. The account and this device's settings have screens of their
 * own; this one only says, in a line, when the list is also in an account.
 */
export function SavedScreen({ accounts }: { accounts: boolean }) {
  const entries = useCollection();
  const hydrated = useHydrated();
  const { username } = useAccount();
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

  const importer = useImport(say);

  const searchable = entries.length >= FILTER_FROM;
  const filtering = searchable && !!filter.trim();
  const shown = filtering ? match(entries, filter) : entries;
  const groups = byVillage(shown);
  // Read through what is on screen, so neither a removed entry nor one the
  // filter hides is acted on unseen.
  const chosen = shown.filter((e) => selected.has(e.id));
  const allChosen = shown.length > 0 && chosen.length === shown.length;
  const villages = new Set(entries.map(placeOf)).size;
  const empty = hydrated && entries.length === 0;

  function remove(ids: string[]) {
    const removed = collection.forget(ids);
    if (!removed.length) return;
    // Dropped from the selection too, so Undo does not bring them back ticked.
    setSelected((was) => new Set([...was].filter((id) => !ids.includes(id))));
    say(removed.length === 1 ? `Removed ${titleOf(removed[0]!.entry)}` : `Removed ${removed.length} records`, removed);
  }

  async function share(list: Entry[]) {
    try {
      const how = await shareLink("Saved land records, Bhumi", await collectionUrl(list));
      if (how === "copied") say("Link copied. Whoever opens it can add these to their own list.");
      if (how === "failed") say("Could not copy the link.");
    } catch {
      say("Could not make a link for these records.");
    }
  }

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        <div className="intro">
          <h1 className="intro-title">Saved records</h1>
          <p className="lede">
            {!hydrated || empty ? (
              "Records you save are kept here, ready to open, even with no signal."
            ) : username ? (
              <>
                Kept on this device and in <Link href="/account">your account</Link>. They open even with no signal.
              </>
            ) : (
              "Kept on this device. They open even with no signal."
            )}
          </p>
        </div>

        <section className="step" aria-labelledby="saved-list-title">
          {!hydrated ? (
            <>
              <h2 className="sr-only" id="saved-list-title">
                Your records
              </h2>
              <SkeletonRows />
            </>
          ) : empty ? (
            <div className="saved-empty">
              <h2 className="sr-only" id="saved-list-title">
                Your records
              </h2>
              <p>Nothing saved yet. Open a record and press Save, and it will be here.</p>
              <div className="step-actions">
                <Link className="btn btn-primary" href="/">
                  Find a record
                </Link>
                <button type="button" className="btn btn-ghost" onClick={importer.open}>
                  Import a backup
                </button>
              </div>
              {accounts && !username && (
                <p className="help">
                  Saved records on another phone? <Link href="/account">Sign in</Link> to bring them here.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="step-head">
                <h2 className="saved-summary" id="saved-list-title">
                  {plural(entries.length, "record")}
                  {villages > 1 && ` in ${villages} villages`}
                </h2>
                <div className="saved-tools">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditing((on) => !on);
                      setSelected(new Set());
                    }}
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                  <Menu title="Saved records" className="btn btn-ghost btn-sm">
                    {(close) => (
                      <>
                        <button
                          type="button"
                          className="menu-opt"
                          onClick={() => {
                            close();
                            void share(entries);
                          }}
                        >
                          <span className="menu-opt-text">
                            Share the list
                            <span className="menu-opt-meta">As a link, for WhatsApp or SMS</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="menu-opt"
                          onClick={() => {
                            close();
                            exportFile(entries);
                          }}
                        >
                          <span className="menu-opt-text">
                            Back up to a file
                            <span className="menu-opt-meta">To keep, or to move to a phone with no account</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="menu-opt"
                          onClick={() => {
                            close();
                            importer.open();
                          }}
                        >
                          <span className="menu-opt-text">
                            Import a backup
                            <span className="menu-opt-meta">Adds its records to this list</span>
                          </span>
                        </button>
                      </>
                    )}
                  </Menu>
                </div>
              </div>

              {searchable && (
                <input
                  className="inp"
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Find by name, village or number"
                  aria-label="Find a saved record"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              )}

              {editing && (
                <div className="saved-select" role="group" aria-label="With the selected records">
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
                    Back up
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

              {shown.length === 0 && <p className="help">No saved record matches “{filter.trim()}”.</p>}
              {editing && filtering && shown.length > 0 && <p className="help">Clear the search to reorder.</p>}

              {editing ? (
                <ul className="saved-list">
                  {shown.map((entry) => (
                    <EditRow
                      key={entry.id}
                      entry={entry}
                      index={entries.indexOf(entry)}
                      total={entries.length}
                      // Moving within a filtered list would skip rows the user cannot see.
                      canMove={!filtering}
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
                <div>
                  {groups.map(([village, list]) => (
                    <div key={village} className="saved-group">
                      <h3 className="saved-group-title" lang="mr">
                        {list[0]!.place.villageName}
                        <span>
                          {[list[0]!.place.talukaName, list[0]!.place.districtName].filter(Boolean).join(", ")}
                        </span>
                      </h3>
                      <ul className="saved-list">
                        {list.map((entry) => (
                          <li key={entry.id}>
                            <SavedRow entry={entry} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {importer.input}

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

/** Save records as a backup file, the same format a shared link carries. */
function exportFile(list: Entry[]) {
  const blob = new Blob([JSON.stringify(collection.toFile(list), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bhumi-saved-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Importing a backup: a hidden file input and a way to open it. The input
 * lives outside any menu, so closing the menu does not take the picker with it.
 */
function useImport(onDone: (note: string) => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    try {
      const { added, skipped } = collection.merge(collection.fromFile(await file.text()));
      onDone(
        added === 0
          ? "Everything in that file is already saved."
          : `Added ${plural(added, "record")}${skipped ? `; ${skipped} were already saved` : ""}.`,
      );
    } catch (e) {
      onDone(errorMessage(e));
    }
  }
  return {
    open: () => fileRef.current?.click(),
    input: (
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
    ),
  };
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
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canMove || index === total - 1}
          aria-label={`Move ${titleOf(entry)} down`}
          onClick={() => collection.move(entry.id, index + 1)}
        >
          <ArrowDown size={16} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${titleOf(entry)}`} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
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
