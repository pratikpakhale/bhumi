"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { parseEightA, type Option, type RecordDocument } from "@bhumi/core";
import { api, type Locator } from "@/lib/client";
import { lookupFrom, lookupKey, searchHref, searchParams } from "@/lib/search-params";
import {
  MOBILE,
  readMobile,
  recordInput,
  resolveLanguage,
  resolveSearchType,
  saveMobile,
} from "@/lib/record-request";
import { useResource, dataOf } from "@/lib/resource";
import {
  collection,
  entryId,
  placeName,
  subjectFromLookup,
  titleOf,
  useEntry,
  type Place,
} from "@/lib/collection";
import {
  forgetHistory,
  historyFor,
  recordSnapshot,
  type Snapshot,
  type SnapshotStatus,
} from "@/lib/snapshots";
import type { TreeSnapshot } from "@/lib/tree";
import {
  RecordView,
  viewableFromDocument,
  viewableFromSnapshot,
  type Viewable,
} from "@/components/RecordView";
import { SaveControl } from "@/components/SaveControl";
import { HeldBy, Holdings } from "@/components/Relations";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * The document.
 *
 * A URL that names a record opens *as* that record: there is no form here and
 * nothing to fill in, so while the portal is answering there is one loader and
 * nothing else. Anything this device already holds paints first, which for a
 * kept subject means the record is on screen before the network is consulted at
 * all — including with no signal, which is the situation this app's reader is
 * usually in.
 */
export function DocumentScreen({ initial }: { initial: TreeSnapshot }) {
  const [sp, setSp] = useQueryStates(searchParams);
  const { type, district, taluka, village, mode, st, q, parcel, sankalan, purpose, duration } = sp;

  // Rebuilt only when a field that identifies the document changes, so it is a
  // safe dependency for the fetch effect below.
  const lookup = useMemo(
    () => lookupFrom(sp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, district, taluka, village, mode, st, q, parcel, sankalan, purpose, duration],
  );
  const key = lookup ? lookupKey(lookup) : null;
  const loc: Locator | null = lookup
    ? { recordType: lookup.type, district: lookup.district, taluka: lookup.taluka, village: lookup.village }
    : null;

  /**
   * The village behind the codes. Whatever the server had cached paints first;
   * anything it did not have is fetched here, so the page never settles on bare
   * codes. A kept subject carries its own names, which is what lets this page
   * read correctly with no network at all.
   */
  const districtsRes = useResource(
    lookup ? `d|${lookup.type}` : null,
    () => api.districts(lookup!.type),
    initial.districts,
  );
  const talukasRes = useResource(
    lookup ? `t|${lookup.type}|${lookup.district}` : null,
    () => api.talukas(lookup!.type, lookup!.district),
    initial.talukas,
  );
  const villagesRes = useResource(
    lookup ? `v|${lookup.type}|${lookup.district}|${lookup.taluka}` : null,
    () => api.villages(lookup!.type, lookup!.district, lookup!.taluka),
    initial.villages,
  );
  const fromTree = useMemo<Place | null>(
    () =>
      lookup
        ? {
            district: lookup.district,
            taluka: lookup.taluka,
            village: lookup.village,
            districtName: labelOf(dataOf(districtsRes), lookup.district) ?? lookup.district,
            talukaName: labelOf(dataOf(talukasRes), lookup.taluka) ?? lookup.taluka,
            villageName: labelOf(dataOf(villagesRes), lookup.village) ?? lookup.village,
          }
        : null,
    [lookup, districtsRes, talukasRes, villagesRes],
  );

  // The subject this document is about. Its id needs only the village *codes*,
  // so it is known before any names are resolved — no circularity with `entry`.
  const draft = fromTree && lookup ? subjectFromLookup(fromTree, lookup) : null;
  const entry = useEntry(draft ? entryId(draft.place, draft.kind, draft.code) : null);
  // An entry saved before its village's names had loaded holds codes in their
  // place; the tree's names win there, and are written back to the entry.
  const place = useMemo(() => (entry ? withNames(entry.place, fromTree) : fromTree), [entry, fromTree]);
  useEffect(() => {
    if (entry && place && place !== entry.place) collection.setPlace(entry.id, place);
  }, [entry, place]);
  const subject = place && lookup ? subjectFromLookup(place, lookup) : null;

  const contextRes = useResource(
    loc ? `c|${loc.recordType}|${loc.district}|${loc.taluka}|${loc.village}` : null,
    () => api.context(loc!.recordType, loc!.district, loc!.taluka, loc!.village),
    initial.context,
  );
  const ctx = dataOf(contextRes) ?? null;

  // --- Sources: the copy on this device, and the live one --------------------

  const [history, setHistory] = useState<Snapshot[]>([]);
  const [live, setLive] = useState<RecordDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  /** How the last fetch compared with what this device already held. */
  const [status, setStatus] = useState<SnapshotStatus | null>(null);
  /** A history entry the user chose to look at instead of the current record. */
  const [pinned, setPinned] = useState<Snapshot | null>(null);
  const [mobile, setMobile] = useState<string | null>(null);

  useEffect(() => setMobile(readMobile()), []);

  useEffect(() => {
    setLive(null);
    setError(null);
    setStatus(null);
    setPinned(null);
    setHistory([]);
    if (!key) return;
    let alive = true;
    void historyFor(key).then((rows) => alive && setHistory(rows));
    return () => {
      alive = false;
    };
  }, [key]);

  const searchType = resolveSearchType(ctx, lookup);
  const language = resolveLanguage(ctx, sp.lang);
  const canFetch = !!recordInput(lookup, language, mobile ?? "", searchType);

  const fetchNow = useCallback(
    async (lang?: string) => {
      const chosen = resolveLanguage(ctx, lang ?? sp.lang);
      const input = recordInput(lookup, chosen, mobile ?? "", resolveSearchType(ctx, lookup));
      if (!loc || !key || !input) return;
      setFetching(true);
      setError(null);
      try {
        const document = await api.record(loc, sp.mode, input);
        setLive(document);
        setPinned(null);
        // The store, not this component, decides what the fetch amounted to —
        // it is the only thing that has seen the previous bytes.
        setStatus((await recordSnapshot(key, document)).status);
        setHistory(await historyFor(key));
      } catch (e) {
        setError(msg(e));
      } finally {
        setFetching(false);
      }
    },
    [loc, key, lookup, ctx, mobile, sp.lang, sp.mode],
  );

  /**
   * Opening this page *is* the request, so it fetches on arrival — once per
   * document, and only once the two things it needs have landed: the village's
   * context and the device's mobile number.
   */
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!key || !canFetch || requested.current === key) return;
    requested.current = key;
    void fetchNow();
  }, [key, canFetch, fetchNow]);

  // --- What to show ---------------------------------------------------------

  const showing = pinned ?? (live ? null : history[0] ?? null);
  const [snapView, setSnapView] = useState<Viewable | null>(null);
  useEffect(() => {
    if (!showing) {
      setSnapView(null);
      return;
    }
    let alive = true;
    void viewableFromSnapshot(showing).then((v) => alive && setSnapView(v));
    return () => {
      alive = false;
    };
  }, [showing]);

  const liveView = useMemo(() => (live ? viewableFromDocument(live) : null), [live]);
  const view = pinned ? snapView : liveView ?? snapView;

  /**
   * An 8A *is* the list of survey numbers held under a khata, so reading the
   * document on screen — live or stored — hands over the whole holder → land
   * edge without a further request.
   */
  const holdings = useMemo(
    () =>
      view?.format === "html" && view.recordType === "8A"
        ? parseEightA(view.html).surveyNumbers
        : [],
    [view],
  );

  // Kept on the entry so the reverse direction works later, offline.
  useEffect(() => {
    if (holdings.length && entry?.kind === "holder") collection.setHoldings(entry.id, holdings);
  }, [holdings, entry?.id, entry?.kind]);

  // Without the village's context there is nothing to fetch with, so a failure
  // there is this screen's failure too.
  const failure = error ?? (contextRes.status === "error" ? contextRes.message : null);

  const mobileValid = MOBILE.test(mobile ?? "");
  const needsMobile = mobile !== null && !mobileValid;
  const title = entry ? titleOf(entry) : subject?.code ?? "";

  return (
    <div className="shell">
      <header className="masthead">
        <Link className="wordmark" href="/">
          Bhumi
        </Link>
        {lookup && (
          <Link className="source" href={searchHref(lookup, sp.lang)}>
            Search
          </Link>
        )}
      </header>

      {place && (
        <div className="doc-head">
          <h1 className="doc-title" lang="mr">
            {title}
          </h1>
          <p className="doc-path" lang="mr">
            {placeName(place)}
          </p>
        </div>
      )}

      {!lookup && <p className="alert">This link does not name a record.</p>}

      {lookup && needsMobile && (
        <div className="gate">
          <MobileForm
            onSubmit={(value) => {
              saveMobile(value);
              setMobile(value);
            }}
          />
        </div>
      )}

      {lookup && !view && !needsMobile && !failure && (
        <div className="gate" role="status">
          <span className="spinner spinner-lg" aria-hidden="true" />
          <p className="help">Fetching from Mahabhulekh. The portal is slow; this can take up to half a minute.</p>
        </div>
      )}

      {!view && failure && !needsMobile && (
        <div className="gate">
          <p className="alert" role="alert">
            {failure}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={fetching || (!canFetch && contextRes.status !== "error")}
            onClick={() => (canFetch ? void fetchNow() : window.location.reload())}
          >
            Try again
          </button>
        </div>
      )}

      {view && (
        <RecordView
          doc={view}
          scrollIntoView={false}
          meta={
            <Freshness
              pinned={pinned}
              live={!!live}
              fetching={fetching}
              error={error}
              latest={history[0] ?? null}
              status={status}
            />
          }
          actions={
            <>
              {subject && <SaveControl subject={subject} />}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void fetchNow()}
                disabled={fetching || !canFetch}
              >
                {fetching ? "Refreshing" : "Refresh"}
              </button>
              {ctx && ctx.languages.length > 1 && (
                <select
                  className="sel sel-inline"
                  aria-label="Language"
                  value={language}
                  disabled={fetching}
                  onChange={(e) => {
                    void setSp({ lang: e.target.value });
                    void fetchNow(e.target.value);
                  }}
                >
                  {ctx.languages.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              )}
            </>
          }
        />
      )}

      {view && error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {place && holdings.length > 0 && (
        <Holdings place={place} numbers={holdings} lang={sp.lang} />
      )}

      {place && subject?.kind === "parcel" && (
        <HeldBy place={place} number={subject.code} lang={sp.lang} />
      )}

      {history.length > 0 && (
        <History
          rows={history}
          pinned={pinned}
          onPin={setPinned}
          hasLive={!!live}
          onClear={async () => {
            if (!key) return;
            await forgetHistory(key);
            setHistory([]);
            setPinned(null);
          }}
        />
      )}
    </div>
  );
}

/** Says which copy is on screen and how current it is. */
function Freshness({
  pinned,
  live,
  fetching,
  error,
  latest,
  status,
}: {
  pinned: Snapshot | null;
  live: boolean;
  fetching: boolean;
  error: string | null;
  latest: Snapshot | null;
  status: SnapshotStatus | null;
}) {
  if (pinned) return <> · {day(pinned.firstSeenAt)}</>;
  if (live) {
    if (status === "changed") return <> · Changed since your last copy</>;
    return <> · Just now</>;
  }
  if (!latest) return null;
  if (fetching) return <> · {day(latest.firstSeenAt)} · refreshing</>;
  return <> · {day(latest.firstSeenAt)}</>;
}

/**
 * The record's history on this device.
 *
 * Every row is a version whose bytes differ from the one before it, so the list
 * is a changelog of the land rather than a log of how often it was opened. It
 * is also the only part of this app the portal cannot give back: Mahabhulekh
 * serves the current 7/12 and keeps no public record of फेरफार, so a copy is
 * the only answer there will ever be to "what did this say last March".
 */
function History({
  rows,
  pinned,
  onPin,
  hasLive,
  onClear,
}: {
  rows: Snapshot[];
  pinned: Snapshot | null;
  onPin: (s: Snapshot | null) => void;
  hasLive: boolean;
  onClear: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="history" open={pinned ? true : undefined}>
      <summary>
        History<span className="count">{rows.length}</span>
      </summary>
      <ol className="history-list">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="history-row"
              aria-current={pinned?.id === row.id || undefined}
              onClick={() => onPin(pinned?.id === row.id ? null : row)}
            >
              <span className="history-date">{day(row.firstSeenAt)}</span>
              {row.lastSeenAt !== row.firstSeenAt && (
                <span className="history-note">to {day(row.lastSeenAt)}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <div className="record-actions">
        {pinned && (
          <button type="button" className="btn btn-ghost" onClick={() => onPin(null)}>
            {hasLive ? "Current" : "Latest"}
          </button>
        )}
        {/* Two presses, because the portal cannot give any of this back. */}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (confirming) void onClear();
            setConfirming(!confirming);
          }}
        >
          {confirming ? "Delete — cannot be undone" : "Clear"}
        </button>
      </div>
    </details>
  );
}

/**
 * A plausible Indian mobile number: starts 6-9, ten digits. The portal demands
 * one on every request but never verifies it, so nobody should have to hand
 * over their own just to read a public record.
 */
const randomMobile = () =>
  String(6 + Math.floor(Math.random() * 4)) +
  Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");

function MobileForm({ onSubmit }: { onSubmit: (value: string) => void }) {
  // Only ever rendered on the client (it waits for localStorage), so a random
  // initial value cannot mismatch the server render.
  const [value, setValue] = useState(randomMobile);
  const valid = MOBILE.test(value);
  return (
    <div className="field">
      <label className="lbl" htmlFor="doc-mobile">
        Mobile number
      </label>
      <div className="search-group">
        <input
          id="doc-mobile"
          className="inp"
          autoFocus
          value={value}
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          aria-invalid={!!value && !valid}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && valid && onSubmit(value)}
          placeholder="10 digits"
          aria-describedby="doc-mobile-help"
        />
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSubmit(value)}>
          Open
        </button>
      </div>
      <p className="help" id="doc-mobile-help">
        Mahabhulekh asks for a mobile number but accepts any number without verification. This one
        was generated at random; use your own if you prefer. It stays on this device.
      </p>
    </div>
  );
}

const labelOf = (options: Option[] | undefined, value: string) =>
  options?.find((o) => o.value === value)?.label ?? null;

/** `place` with any name that is still just its code filled in from `names`. */
function withNames(place: Place, names: Place | null): Place {
  if (!names) return place;
  const pick = (name: string, code: string, better: string) =>
    name === code && better !== code ? better : name;
  const next = {
    ...place,
    districtName: pick(place.districtName, place.district, names.districtName),
    talukaName: pick(place.talukaName, place.taluka, names.talukaName),
    villageName: pick(place.villageName, place.village, names.villageName),
  };
  return next.districtName === place.districtName &&
    next.talukaName === place.talukaName &&
    next.villageName === place.villageName
    ? place
    : next;
}
