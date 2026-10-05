"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Option } from "@bhumi/core";
import { remember, useRecents } from "@/lib/recents";

interface Props {
  options: Option[];
  value: string | null;
  onChange: (value: string, option: Option) => void;
  id?: string;
  /** Plural noun for what is listed — "villages" — used in status messages. */
  noun: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Remembers picks under this scope and offers them first. See `lib/recents.ts`. */
  recentScope?: string;
}

/** Beyond this the list stops being scannable and the filter is the answer. */
const MAX_RENDERED = 300;
/** Recent picks offered above the full list. */
const MAX_RECENT = 4;

interface Row {
  opt: Option;
  recent: boolean;
}

/**
 * A type-to-filter dropdown that stays usable with hundreds of options.
 *
 * Implements the ARIA 1.2 combobox pattern rather than approximating it: the
 * input owns `role="combobox"` and points at the active option through
 * `aria-activedescendant`, so focus never leaves the text field and screen
 * readers announce the highlighted row as the user arrows through it.
 *
 * While its options load it stays exactly where it is — same box, same size —
 * and says what it is waiting for, so nothing on the page jumps and focus is
 * never lost to a placeholder swapped in underneath it.
 */
export function Combobox({
  options,
  value,
  onChange,
  id,
  noun,
  placeholder = "Select…",
  disabled: disabledProp,
  loading,
  recentScope,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reactId = useId();
  const inputId = id ?? `combo-${reactId}`;
  const listId = `${inputId}-list`;
  const disabled = disabledProp || loading;
  const expanded = open && !disabled;

  const selected = options.find((o) => o.value === value) ?? null;
  const recentValues = useRecents(recentScope);

  const q = query.trim().toLowerCase();
  // Recent picks lead the rows only while nothing is typed; a filter searches the full list.
  const { rows, recentCount, total } = useMemo(() => {
    const full = (opts: Option[]): Row[] => opts.slice(0, MAX_RENDERED).map((opt) => ({ opt, recent: false }));
    if (q) {
      const hits = options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      );
      return { rows: full(hits), recentCount: 0, total: hits.length };
    }
    const byValue = new Map(options.map((o) => [o.value, o]));
    const recent: Row[] = recentValues
      .map((v) => byValue.get(v))
      .filter((o): o is Option => !!o)
      .slice(0, MAX_RECENT)
      .map((opt) => ({ opt, recent: true }));
    return { rows: [...recent, ...full(options)], recentCount: recent.length, total: options.length };
  }, [q, options, recentValues]);

  // Opening starts at the current choice (in the full list, not its recent
  // copy). The list may have been replaced since it was last open, so a
  // remembered index could point past its end.
  useEffect(() => {
    if (!open) return;
    const at = rows.findIndex((r) => !r.recent && r.opt.value === value);
    setActive(Math.max(0, at));
    // Only on open, and when a new list arrives while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options]);

  // Keep the highlighted row in view while arrowing, without moving focus.
  useEffect(() => {
    if (!expanded) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, expanded]);

  // A tap anywhere else closes the list. Pointer events, so touch counts too.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function openList() {
    if (disabled || open) return;
    setOpen(true);
    // On a phone the keyboard takes half the screen; lift the field to the top
    // so the list opens into the half that is left.
    if (matchMedia("(pointer: coarse)").matches) {
      setTimeout(() => rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
    }
  }

  function choose(opt: Option) {
    if (recentScope) remember(recentScope, opt.value);
    onChange(opt.value, opt);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) e.stopPropagation();
      close();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(rows.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) choose(row.opt);
    } else if (e.key === "Tab") {
      close();
    }
  }

  const status = loading
    ? `Loading ${noun}…`
    : expanded && q
      ? total === 0
        ? `No ${noun} match`
        : `${total} ${total === 1 ? "match" : "matches"}`
      : "";

  const optionRow = ({ opt, recent }: Row, i: number) => (
    <div
      key={`${recent ? "r" : "a"}-${opt.value}`}
      id={`${inputId}-opt-${i}`}
      data-index={i}
      role="option"
      aria-selected={opt.value === value}
      data-active={i === active ? "true" : "false"}
      className="combo-opt"
      onPointerMove={() => i !== active && setActive(i)}
      onClick={() => choose(opt)}
    >
      <span className="combo-opt-label">
        <Highlight text={opt.label} match={q} />
      </span>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="combo"
      data-open={expanded ? "true" : "false"}
      aria-busy={loading || undefined}
      onKeyDown={onKeyDown}
    >
      <input
        id={inputId}
        className="inp"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && rows[active] ? `${inputId}-opt-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        // While filtering, the current choice stays visible as the placeholder.
        placeholder={loading ? `Loading ${noun}…` : open && selected ? selected.label : placeholder}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
      />
      {loading ? (
        <span className="combo-chevron spinner" aria-hidden="true" />
      ) : (
        <svg className="combo-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <div
        ref={listRef}
        className="combo-list"
        role="listbox"
        id={listId}
        aria-label={noun}
        hidden={!expanded}
        // Keep focus in the input while a row is tapped.
        onMouseDown={(e) => e.preventDefault()}
      >
        {expanded &&
          (rows.length === 0 ? (
            <p className="combo-empty">No {noun} match “{query.trim()}”</p>
          ) : (
            <>
              {recentCount > 0 && (
                <div role="group" aria-labelledby={`${inputId}-recent`}>
                  <p className="combo-group" id={`${inputId}-recent`}>
                    Recent
                  </p>
                  {rows.slice(0, recentCount).map(optionRow)}
                </div>
              )}
              {recentCount > 0 ? (
                <div role="group" aria-labelledby={`${inputId}-all`}>
                  <p className="combo-group" id={`${inputId}-all`}>
                    All {noun}
                  </p>
                  {rows.slice(recentCount).map((r, i) => optionRow(r, i + recentCount))}
                </div>
              ) : (
                rows.map(optionRow)
              )}
              {total > rows.length - recentCount && (
                <p className="combo-more">
                  Showing {rows.length - recentCount} of {total}. Type to narrow the list.
                </p>
              )}
            </>
          ))}
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}

/** Bolds the matched run so the reason a row survived the filter is visible. */
function Highlight({ text, match }: { text: string; match: string }) {
  if (!match) return <>{text}</>;
  const at = text.toLowerCase().indexOf(match);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + match.length)}</mark>
      {text.slice(at + match.length)}
    </>
  );
}
