"use client";

/**
 * The collection — what the user owns, rather than what the portal serves.
 *
 * The portal has no idea what a family is. It answers one question at a time:
 * "render this document". The earlier version of this file took that literally
 * and saved *document requests*, which made the record type part of a land's
 * identity — so a parcel kept as a 7/12 and the person who holds it kept as an
 * 8A were two unrelated rows, and there was no way to get from one to the
 * other. That is backwards. A family owns land and consists of people; 7/12 and
 * 8A are two things you can *print* about them.
 *
 * So an entry is a subject, and the portal's own addressing turns out to be
 * exactly two codes per village (verified against the live portal):
 *
 * - a **parcel** is its survey/gat number. `ddlsurveyno` in number mode carries
 *   the number as its value, so `167/2` is both the name and the address.
 * - a **holder** is their khata number. 8A's only number search type is
 *   `खाते क्रमांक`, the dropdown's value *is* the khata, and a khata search
 *   returns exactly one row — `प्रकाश विलास पाखले ( 2379 )` is holder `2379`.
 *
 * Everything else the old model stored — search mode, search sub-type, the text
 * typed to find it — is the *route*, not the subject, and two routes to one
 * parcel are still one parcel. Leaving the route out is what makes an entry
 * dedupe correctly and what makes the two directions below possible at all.
 *
 * The relation between the two kinds is not guesswork: an 8A *is* the list of
 * survey numbers held under a khata, so reading one teaches this device the
 * whole edge in a single fetch it was going to make anyway. {@link holdersOf}
 * reads that edge backwards, at no network cost.
 *
 * Deliberately local-first, and deliberately not an account: a synced
 * collection would mean a server holding a map of families to the land they
 * own, keyed by the mobile number the portal already demands.
 */

import { useSyncExternalStore } from "react";
import { normalizeDigits, parseParcelLabel, surveyBase, type RecordType } from "@bhumi/core";
import type { Lookup } from "./search-params";

const KEY = "bhumi_collection_v2";
const LEGACY_KEY = "bhumi_saved_v1";

/**
 * A village, in the portal's codes and in words.
 *
 * The names are not redundant with the codes: resolving `village=273500020431150000`
 * back to `बोरगांव` needs the server's tree cache, and a phone in a field with
 * no signal — this app's usual reader — has no way to do that.
 */
export interface Place {
  district: string;
  taluka: string;
  village: string;
  districtName: string;
  talukaName: string;
  villageName: string;
}

export type Kind = "parcel" | "holder" | "measurement";

interface Common {
  id: string;
  schema: 2;
  /** Survey/gat number, khata number, or mojani number — the portal's address. */
  code: string;
  place: Place;
  /** The holder's name, when the search that found them gave one. */
  name?: string;
  /** The user's own name for it — "आजोबांची जमीन". */
  nickname?: string;
  tags?: string[];
  addedAt: string;
}

/**
 * A survey/gat number, and the register it lives in.
 *
 * 7/12 (गाव नमुना ७/१२) is the rural agricultural register and Property Card
 * (मिळकत पत्रिका) the urban one; a parcel is in one or the other, never both.
 * They are also not interchangeable addresses — the two cascades return
 * *different district lists*, so the codes that reach a village under one do
 * not reach it under the other. Which register found it is therefore part of
 * the parcel, not a view to be picked afterwards.
 */
export interface ParcelEntry extends Common {
  kind: "parcel";
  /** Absent means 7/12, which is what every entry migrated from v1 was. */
  register?: Register;
}

export type Register = Extract<RecordType, "7/12" | "PropertyCard">;

/** A खातेदार. Prints as an 8A, which is also the index of what they hold. */
export interface HolderEntry extends Common {
  kind: "holder";
  /** Survey numbers this holder's 8A listed, normalised. The person → land edge. */
  holds?: string[];
  holdsAt?: string;
}

/**
 * A Kami-Jasti measurement. It is neither a parcel nor a person and its address
 * is three classifications plus a number, so it is the one kind that keeps its
 * request verbatim — and the one with no relations to anything.
 */
export interface MeasurementEntry extends Common {
  kind: "measurement";
  request: Lookup;
}

export type Entry = ParcelEntry | HolderEntry | MeasurementEntry;

/** An entry before the store gives it an identity and a date. */
export type Draft =
  | Omit<ParcelEntry, "id" | "schema" | "addedAt">
  | Omit<HolderEntry, "id" | "schema" | "addedAt">
  | Omit<MeasurementEntry, "id" | "schema" | "addedAt">;

/** An entry taken out of the list, and where it stood. */
export interface Removed {
  entry: Entry;
  index: number;
}

/** The wire format of an exported or shared collection. */
export interface CollectionFile {
  app: "bhumi";
  schema: 2;
  exportedAt: string;
  entries: Entry[];
}

// ── Identity and addressing ──────────────────────────────────────────────────

/** Devanagari digits and stray spaces out, so `१६७ /२` and `167/2` are one code. */
export const normalizeCode = (s: string): string => normalizeDigits(s).replace(/\s+/g, "");

/** Village + kind + code. No record type, no search route: just the subject. */
export const entryId = (place: Place, kind: Kind, code: string): string =>
  [place.district, place.taluka, place.village, kind, code].join("|");

export const samePlace = (a: Place, b: Place): boolean =>
  a.district === b.district && a.taluka === b.taluka && a.village === b.village;

const codes = (p: Place) => ({ district: p.district, taluka: p.taluka, village: p.village });
const NO_KJP = { sankalan: null, purpose: null, duration: null } as const;

/**
 * The request for a parcel's document.
 *
 * The query is the *stem*: the portal's number search matches the भूमापन
 * क्रमांक only, so `167/2` returns nothing while `167` returns every
 * sub-division, `167/2` among them.
 *
 * `st` is left null on purpose. The number search type is village reference
 * data, and the document screen fills it in from the village's own context, so
 * a saved link stays short and survives the portal renumbering its dropdowns.
 */
export const parcelLookup = (place: Place, number: string, type: RecordType = "7/12"): Lookup => ({
  type,
  ...codes(place),
  mode: "number",
  st: null,
  q: surveyBase(number),
  parcel: number,
  ...NO_KJP,
});

/** The request for a holder's 8A — khata number in, exactly one row out. */
export const holderLookup = (place: Place, khata: string): Lookup => ({
  type: "8A",
  ...codes(place),
  mode: "number",
  st: null,
  q: khata,
  parcel: khata,
  ...NO_KJP,
});

/**
 * The document request for a subject. Total: every kind has exactly one address,
 * and a draft addresses the same document the saved entry would.
 */
export function lookupFor(subject: Draft | Entry): Lookup {
  switch (subject.kind) {
    case "holder":
      return holderLookup(subject.place, subject.code);
    case "measurement":
      return subject.request;
    case "parcel":
      return parcelLookup(subject.place, subject.code, subject.register ?? "7/12");
  }
}

/** The subject a document request is about — {@link lookupFor} read backwards. */
export function subjectFromLookup(place: Place, lookup: Lookup): Draft | null {
  if (lookup.type === "KJP") {
    const code = normalizeCode(lookup.q);
    return code ? { kind: "measurement", code, place, request: lookup } : null;
  }
  const code = normalizeCode(lookup.parcel ?? "");
  if (!code) return null;
  if (lookup.type === "8A") return { kind: "holder", code, place };
  return { kind: "parcel", code, place, register: registerOf(lookup.type) };
}

const registerOf = (type: RecordType): Register =>
  type === "PropertyCard" ? "PropertyCard" : "7/12";

/**
 * What a search result stands for.
 *
 * The record type being searched decides the kind, because the portal reuses
 * one dropdown for both: searching 8A returns khata holders, searching 7/12 or
 * a Property Card returns parcels.
 *
 * A number-search row is a bare number, and an 8A row's value is the khata, so
 * the value is the code. A 7/12 name-search row is the exception: its value is
 * its own label — `काशिनाथ तुकाराम गडदे ( 1 ) [ 23 ]`, holder ( survey ) [ khata ]
 * — so the survey number has to be read out of it. Keeping that as the code is
 * what makes a parcel found by name the same subject as one found by number.
 */
export function subjectOf(
  place: Place,
  type: RecordType,
  option: { value: string; label: string },
): Draft | null {
  if (type === "KJP") return null;
  const row = parseParcelLabel(option.label);
  const name = row.name ?? undefined;
  if (type === "8A") {
    const code = normalizeCode(option.value);
    return code ? { kind: "holder", code, place, name } : null;
  }
  const code = normalizeCode(row.name && row.number ? row.number : option.value);
  return code ? { kind: "parcel", code, place, register: registerOf(type), name } : null;
}

/** The document a subject opens as. */
export const viewOf = (subject: Draft | Entry): RecordType =>
  subject.kind === "holder"
    ? "8A"
    : subject.kind === "measurement"
      ? "KJP"
      : (subject.register ?? "7/12");

/**
 * Everyone in the collection whose 8A listed this survey number.
 *
 * The land → person direction, which the portal itself cannot answer: a 7/12 is
 * a scanned image, so nothing can be read back out of it. This works instead
 * because every 8A that has been opened left its holdings behind, which makes
 * the reverse edge free and available with no signal.
 */
export function holdersOf(entries: Entry[], place: Place, number: string): HolderEntry[] {
  const wanted = normalizeCode(number);
  return entries.filter(
    (e): e is HolderEntry =>
      e.kind === "holder" && samePlace(e.place, place) && !!e.holds?.includes(wanted),
  );
}

/** "सांगली › वाळवा › बोरगांव". */
export const placeName = (p: Place): string =>
  [p.districtName, p.talukaName, p.villageName].filter(Boolean).join(" › ");

export const placeOf = (e: Entry): string => placeName(e.place);

/** What to call it: the user's name for it, else the holder's name, else the code. */
export const titleOf = (e: Entry): string => e.nickname?.trim() || e.name || e.code;

// ── Store ────────────────────────────────────────────────────────────────────

const EMPTY: Entry[] = [];
const listeners = new Set<() => void>();
let cache: Entry[] | null = null;

/**
 * Anything that is not a well-formed entry is dropped rather than repaired.
 * The data is user-owned and hand-editable via export/import, so a half-read
 * entry that renders as a broken row is worse than one that never appears.
 */
function valid(x: unknown): x is Entry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Partial<Entry>;
  if (e.schema !== 2 || typeof e.id !== "string" || typeof e.code !== "string" || !e.code) {
    return false;
  }
  if (!e.place || typeof e.place.village !== "string") return false;
  if (e.kind === "measurement") return !!(e as MeasurementEntry).request;
  return e.kind === "parcel" || e.kind === "holder";
}

function read(): Entry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      cache = adoptLegacy();
      return cache;
    }
    const parsed: unknown = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed.filter(valid) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Entry[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota is effectively unreachable for a list of this size; if it is hit,
    // the in-memory copy still serves this session.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Another tab writing the same key must not leave this one showing a stale
  // list; drop the cache so the next read goes back to storage.
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

/** The collection, re-rendering every consumer on any change. */
export function useCollection(): Entry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useEntry(id: string | null): Entry | null {
  const entries = useCollection();
  return (id && entries.find((e) => e.id === id)) || null;
}

export function useIsSaved(id: string | null): boolean {
  return !!useEntry(id);
}

// ── Operations ───────────────────────────────────────────────────────────────

export const collection = {
  all: read,

  has: (id: string) => read().some((e) => e.id === id),

  get: (id: string) => read().find((e) => e.id === id) ?? null,

  /**
   * Add a subject, or bring one already held up to date.
   *
   * Re-saving is not an error and cannot duplicate: the id comes from the
   * subject, so saving parcel `167/2` after finding it by surname lands on the
   * same row as saving it after typing `167`.
   */
  save(draft: Draft): Entry {
    const id = entryId(draft.place, draft.kind, draft.code);
    const current = read();
    const was = current.find((e) => e.id === id);
    // What the user typed, and what an 8A taught this device, outlive a re-save
    // that happens to know less than the last one did.
    const kept = {
      id,
      schema: 2 as const,
      name: draft.name ?? was?.name,
      nickname: draft.nickname ?? was?.nickname,
      tags: draft.tags ?? was?.tags,
      addedAt: was?.addedAt ?? new Date().toISOString(),
    };
    const held = was?.kind === "holder" ? was : null;
    const entry: Entry =
      draft.kind === "holder"
        ? {
            ...draft,
            ...kept,
            holds: draft.holds ?? held?.holds,
            holdsAt: draft.holdsAt ?? held?.holdsAt,
          }
        : { ...draft, ...kept };
    write(was ? current.map((e) => (e.id === id ? entry : e)) : [...current, entry]);
    return entry;
  },

  /**
   * Remove subjects, returning what was removed and where, for {@link restore}.
   * Offline copies are left alone: they belong to the record, not the list, and
   * clearing them is its own act on the Saved page (see `copies.ts`).
   */
  forget(ids: string | string[]): Removed[] {
    const drop = new Set(typeof ids === "string" ? [ids] : ids);
    const current = read();
    const removed = current.flatMap((entry, index) => (drop.has(entry.id) ? [{ entry, index }] : []));
    if (removed.length) write(current.filter((e) => !drop.has(e.id)));
    return removed;
  },

  /** Undo a {@link forget}: put each entry back where it was, unless it is back already. */
  restore(removed: Removed[]) {
    const next = [...read()];
    for (const { entry, index } of [...removed].sort((a, b) => a.index - b.index)) {
      if (next.some((e) => e.id === entry.id)) continue;
      next.splice(Math.min(index, next.length), 0, entry);
    }
    write(next);
  },

  update(id: string, patch: Partial<Pick<Entry, "nickname" | "tags">>) {
    write(
      read().map((e) =>
        e.id === id
          ? {
              ...e,
              ...patch,
              nickname: patch.nickname?.trim() || undefined,
              tags: patch.tags?.filter(Boolean),
            }
          : e,
      ),
    );
  },

  /** Replace an entry's place — used to fill in names it was saved without. */
  setPlace(id: string, place: Place) {
    const list = read();
    const at = list.findIndex((e) => e.id === id);
    if (at < 0 || !samePlace(list[at]!.place, place)) return;
    const next = [...list];
    next[at] = { ...list[at]!, place };
    write(next);
  },

  /**
   * Record what a holder's 8A listed.
   *
   * Called with every 8A that arrives, saved or not — for an unsaved holder it
   * is a no-op, and saving them later re-reads it from the document on screen.
   */
  setHoldings(id: string, numbers: string[]) {
    const at = new Date().toISOString();
    write(
      read().map((e) =>
        e.id === id && e.kind === "holder"
          ? { ...e, holds: numbers.map(normalizeCode), holdsAt: at }
          : e,
      ),
    );
  },

  /** Reorder; the list order is the user's own ranking. */
  move(id: string, to: number) {
    const current = [...read()];
    const from = current.findIndex((e) => e.id === id);
    if (from < 0 || to < 0 || to >= current.length || from === to) return;
    const [entry] = current.splice(from, 1);
    current.splice(to, 0, entry!);
    write(current);
  },

  /**
   * Fold an imported or shared collection into this one.
   *
   * Existing entries win: an import must never overwrite a nickname typed here.
   */
  merge(incoming: Entry[]): { added: number; skipped: number } {
    const current = read();
    const known = new Set(current.map((e) => e.id));
    const fresh = fold(incoming.filter(valid)).filter((e) => !known.has(e.id));
    if (fresh.length) write([...current, ...fresh]);
    return { added: fresh.length, skipped: incoming.length - fresh.length };
  },

  toFile(entries?: Entry[]): CollectionFile {
    return {
      app: "bhumi",
      schema: 2,
      exportedAt: new Date().toISOString(),
      entries: entries ?? read(),
    };
  },

  /** Parse an exported file, throwing a readable message on anything else. */
  fromFile(text: string): Entry[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file is not valid JSON.");
    }
    const file = parsed as Partial<CollectionFile> & { lands?: unknown[] };
    if (file?.app !== "bhumi") throw new Error("That is not a Bhumi collection.");
    // A v1 file carries `lands` of saved requests; translate rather than reject.
    if (Array.isArray(file.entries)) return fold(file.entries.filter(valid));
    if (Array.isArray(file.lands)) return fromLegacyList(file.lands);
    throw new Error("That is not a Bhumi collection.");
  },
};

// ── Migration from the request-shaped v1 collection ──────────────────────────

/**
 * Translate the v1 list into subjects, once, on first read.
 *
 * v1 saved a document request, so the subject has to be recovered from the
 * record type: an 8A's chosen `parcel` was always a khata number and a 7/12's
 * was always a survey number. The old key is left in place — this is a
 * translation, not a move, and an untouched original costs nothing.
 */
function adoptLegacy(): Entry[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = fromLegacyList(parsed);
    if (entries.length) localStorage.setItem(KEY, JSON.stringify(entries));
    return entries;
  } catch {
    return EMPTY;
  }
}

/**
 * Fold entries that turned out to be the same subject.
 *
 * v1 keyed on the request, so one parcel saved by number *and* by surname was
 * two rows; under the subject model they collapse to one. The earliest date
 * wins — that is when the user actually first kept it — and any name either
 * copy carries is preserved, since only one of the two routes tends to know it.
 */
function fold(entries: Entry[]): Entry[] {
  const byId = new Map<string, Entry>();
  for (const entry of entries) {
    const was = byId.get(entry.id);
    byId.set(
      entry.id,
      was
        ? {
            ...was,
            name: was.name ?? entry.name,
            nickname: was.nickname ?? entry.nickname,
            addedAt: was.addedAt < entry.addedAt ? was.addedAt : entry.addedAt,
          }
        : entry,
    );
  }
  return [...byId.values()];
}

const fromLegacyList = (lands: unknown[]): Entry[] =>
  fold(lands.map(fromLegacy).filter((e): e is Entry => !!e));

interface LegacyEntry {
  lookup: Lookup;
  labels: { district: string; taluka: string; village: string; parcel: string | null };
  nickname?: string;
  tags?: string[];
  addedAt?: string;
}

function fromLegacy(x: unknown): Entry | null {
  const old = x as Partial<LegacyEntry>;
  const l = old?.lookup;
  const labels = old?.labels;
  if (!l?.district || !l.taluka || !l.village || !labels) return null;

  const place: Place = {
    district: l.district,
    taluka: l.taluka,
    village: l.village,
    districtName: labels.district,
    talukaName: labels.taluka,
    villageName: labels.village,
  };
  const common = {
    schema: 2 as const,
    place,
    nickname: old.nickname,
    tags: old.tags,
    addedAt: old.addedAt ?? new Date().toISOString(),
  };

  if (l.type === "KJP") {
    const code = normalizeCode(l.q);
    if (!code) return null;
    return { ...common, kind: "measurement", code, request: l, id: entryId(place, "measurement", code) };
  }

  // A name search labelled the row "प्रकाश विलास पाखले ( 2379 )"; a number
  // search labelled it "2379", which is no name at all.
  const row = parseParcelLabel(labels.parcel ?? "");
  const named = row.name ?? "";
  // A 7/12 name-search row was saved by its whole label; its code is the
  // survey number inside it.
  const code = normalizeCode(l.type !== "8A" && row.name && row.number ? row.number : l.parcel ?? "");
  if (!code) return null;
  if (l.type === "8A") {
    return {
      ...common,
      kind: "holder",
      code,
      name: named || undefined,
      id: entryId(place, "holder", code),
    };
  }
  return {
    ...common,
    kind: "parcel",
    code,
    name: named || undefined,
    register: registerOf(l.type),
    id: entryId(place, "parcel", code),
  };
}
