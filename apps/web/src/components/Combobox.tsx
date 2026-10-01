"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Option } from "@bhumi/core";

interface Props {
  options: Option[];
  value: string | null;
  onChange: (value: string, option: Option) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

/** Beyond this the list stops being scannable and the filter is the answer. */
const MAX_RENDERED = 300;

/**
 * A type-to-filter dropdown that stays usable with hundreds of options.
 *
 * Implements the ARIA 1.2 combobox pattern rather than approximating it: the
 * input owns `role="combobox"` and points at the active option through
 * `aria-activedescendant`, so focus never leaves the text field and screen
 * readers announce the highlighted row as the user arrows through it.
 */
export function Combobox({
  options,
  value,
  onChange,
  id,
  placeholder = "Select…",
  disabled,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reactId = useId();
  const inputId = id ?? `combo-${reactId}`;
  const listId = `${inputId}-list`;

  const selected = options.find((o) => o.value === value) ?? null;

  // Opening starts at the current choice. The list may have been replaced
  // since it was last open (a new taluka's villages), so a remembered index
  // would point past its end.
  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options]);

  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      )
    : options;
  const shown = filtered.slice(0, MAX_RENDERED);

  // Keep the highlighted row in view while arrowing, without moving focus.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(opt: Option) {
    onChange(opt.value, opt);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(shown.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = shown[active];
      if (opt) choose(opt);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  if (loading) {
    return <div className="skeleton" role="status" aria-label="Loading options" />;
  }

  return (
    <div
      ref={rootRef}
      className="combo"
      data-open={open && !disabled ? "true" : "false"}
      onKeyDown={onKeyDown}
    >
      <input
        id={inputId}
        className="inp"
        role="combobox"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? listId : undefined}
        aria-activedescendant={
          open && shown[active] ? `${inputId}-opt-${active}` : undefined
        }
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        readOnly={!open}
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
      />
      <svg
        className="combo-chevron"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {open && !disabled && (
        <div ref={listRef} className="combo-list" role="listbox" id={listId}>
          {shown.length === 0 ? (
            <p className="combo-empty">No match</p>
          ) : (
            <>
              {shown.map((opt, i) => (
                <div
                  key={opt.value}
                  id={`${inputId}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={opt.value === value}
                  data-active={i === active ? "true" : "false"}
                  className="combo-opt"
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => choose(opt)}
                >
                  <span className="combo-opt-label">
                    <Highlight text={opt.label} match={q} />
                  </span>
                </div>
              ))}
              {filtered.length > shown.length && (
                <p className="combo-more">
                  {shown.length} of {filtered.length}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <span className="sr-only" role="status">
        {open && q ? `${filtered.length} matches` : ""}
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
