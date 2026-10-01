"use client";

import { useRef } from "react";

interface Item<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  items: readonly Item<T>[];
  value: T;
  onChange: (value: T) => void;
  /** id of the visible label describing the group. */
  labelledBy: string;
}

/**
 * A segmented picker for a small, fixed set of mutually exclusive choices.
 *
 * It is a radio group, not a row of toggle buttons: only the selected segment is
 * in the tab order, and the arrow keys move between segments, which is what a
 * keyboard user expects from a control shaped like this.
 */
export function Segmented<T extends string>({ items, value, onChange, labelledBy }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const from = items.findIndex((i) => i.key === value);
    const to = (from + step + items.length) % items.length;
    onChange(items[to]!.key);
    ref.current?.querySelectorAll("button")[to]?.focus();
  }

  return (
    <div
      ref={ref}
      className="segmented"
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="radio"
          aria-checked={item.key === value}
          // With nothing chosen yet, the first segment keeps the group reachable.
          tabIndex={
            item.key === value || (!items.some((i) => i.key === value) && item === items[0]) ? 0 : -1
          }
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
