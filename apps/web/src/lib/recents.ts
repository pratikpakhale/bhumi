"use client";

/**
 * The places this device keeps coming back to.
 *
 * Most people look up land in the same two or three villages for years, and a
 * professional works a handful of talukas. Every dropdown therefore remembers
 * what was picked from it and offers those first, ranked by *frecency* — how
 * often, discounted by how long ago — so last week's village beats one used
 * ten times two years back.
 *
 * A list is scoped to what it chooses among: the talukas of one district, the
 * villages of one taluka. A scope is also per cascade, because the rural (7/12,
 * 8A, map) and urban (Property Card) cascades use different codes for the same
 * names. Only values, never labels, are kept — the labels come from the live
 * list, so a stale memory can never render a name the portal no longer has.
 */

import { useMemo, useSyncExternalStore } from "react";
import type { RecordType } from "@bhumi/core";

const KEY = "bhumi_recents_v1";
/** Values remembered per scope; enough for a professional, small enough to scan. */
const PER_SCOPE = 12;
/** Scopes remembered at all, oldest dropped first. */
const SCOPES = 200;
/** A use loses half its weight every this many days. */
const HALF_LIFE_DAYS = 30;

interface Use {
  /** Times picked. */
  n: number;
  /** Last picked, epoch ms. */
  t: number;
}

type Store = Record<string, Record<string, Use>>;

/** Which cascade a record type's codes belong to. */
const cascadeOf = (rt: RecordType): string =>
  rt === "7/12" || rt === "8A" ? "rural" : rt === "PropertyCard" ? "urban" : "kjp";

/** The scope of a dropdown: what level it picks, under which parents. */
export const scope = (rt: RecordType, ...parents: string[]): string => [cascadeOf(rt), ...parents].join("|");

const EMPTY: Store = {};
let cache: Store | null = null;
const listeners = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Store): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

const weight = (u: Use, now: number) => u.n * 0.5 ** ((now - u.t) / (HALF_LIFE_DAYS * 864e5));

/** Values in a scope, best first. Pure, for tests. */
export function ranked(uses: Record<string, Use> | undefined, now = Date.now()): string[] {
  if (!uses) return [];
  return Object.entries(uses)
    .sort(([, a], [, b]) => weight(b, now) - weight(a, now) || b.t - a.t)
    .map(([value]) => value);
}

/** Note that `value` was picked in `scopeKey`. */
export function remember(scopeKey: string, value: string, now = Date.now()): void {
  const store = read();
  const uses = { ...store[scopeKey] };
  const was = uses[value];
  uses[value] = { n: (was?.n ?? 0) + 1, t: now };
  // Keep the best-ranked values only.
  const keep = ranked(uses, now).slice(0, PER_SCOPE);
  const trimmed = Object.fromEntries(keep.map((v) => [v, uses[v]!]));

  const next: Store = { ...store, [scopeKey]: trimmed };
  const scopes = Object.keys(next);
  if (scopes.length > SCOPES) {
    const lastUse = (k: string) => Math.max(...Object.values(next[k]!).map((u) => u.t));
    for (const k of scopes.sort((a, b) => lastUse(a) - lastUse(b)).slice(0, scopes.length - SCOPES)) {
      delete next[k];
    }
  }
  write(next);
}

/** Forget everything — part of clearing this device's data. */
export function forgetAll(): void {
  write({});
}

/** The values remembered for a scope, best first. Empty on the server. */
export function useRecents(scopeKey: string | undefined): string[] {
  const store = useSyncExternalStore(subscribe, read, () => EMPTY);
  const uses = scopeKey ? store[scopeKey] : undefined;
  // Re-ranked only when this scope changes, so callers get a stable array.
  return useMemo(() => ranked(uses), [uses]);
}
