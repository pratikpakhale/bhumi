"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RECORD_LABELS, recordHref } from "@/lib/search-params";
import { lookupFor, placeOf, titleOf, useCollection, viewOf, type Entry } from "@/lib/collection";

/**
 * ⌘K over the saved lands.
 *
 * The app's one success measure is time from landing to record on screen. For
 * someone who has been here before, this is the shortest that path can get:
 * a keystroke, a few letters, Enter — no cascade at all.
 */
export function CommandPalette() {
  const entries = useCollection();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const hasEntries = entries.length > 0;
  useEffect(() => {
    // With nothing saved there is nothing to open, and the browser's own ⌘K stays.
    if (!hasEntries) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasEntries]);

  // Focus goes into the palette on open and back where it was on close.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, [open]);

  const matches = useMemo(() => filter(entries, query), [entries, query]);

  // The active row can outrun a narrowing list; keep it inside the results.
  useEffect(() => setActive((i) => Math.min(i, Math.max(0, matches.length - 1))), [matches.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || entries.length === 0) return null;

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    router.push(recordHref(lookupFor(entry)));
  };

  return (
    <div className="palette-backdrop" onPointerDown={() => setOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Open a saved record"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="palette-list"
          aria-activedescendant={matches[active] ? `palette-${active}` : undefined}
          aria-label="Search saved records"
          placeholder="Open a saved record…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            // The input is the dialog's only stop; Tab must not walk into the page behind.
            else if (e.key === "Tab") e.preventDefault();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(matches[active]);
            }
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {matches.map((entry, i) => (
            <li
              key={entry.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className="palette-opt"
              // Click, not pointerdown: a finger that lands on a row to start a
              // scroll must not open it. Keeping focus in the input is enough.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(entry)}
              onPointerEnter={() => setActive(i)}
            >
              <span className="palette-opt-title" lang="mr">
                {titleOf(entry)}
              </span>
              <span className="palette-opt-path" lang="mr">
                {placeOf(entry)}
              </span>
              <span className="palette-opt-type">{RECORD_LABELS[viewOf(entry)]}</span>
            </li>
          ))}
        </ul>
        {matches.length === 0 && <p className="combo-empty">Nothing saved matches “{query.trim()}”.</p>}
      </div>
    </div>
  );
}

/** Match on everything a person might remember: a name, a place, or a number. */
function filter(entries: Entry[], query: string): Entry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [titleOf(entry), placeOf(entry), entry.code, entry.name ?? "", ...(entry.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
