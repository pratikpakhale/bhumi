"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { parseEightA, type Option, type RecordDocument } from "@bhumi/core";
import { api, canRetry, errorMessage, type Locator } from "@/lib/client";
import { lookupFrom, lookupKey, searchHref, searchParams } from "@/lib/search-params";
import { deviceMobile, recordInput, resolveLanguage, resolveSearchType } from "@/lib/record-request";
import { useResource, dataOf } from "@/lib/resource";
import {
  collection,
  entryId,
  placeName,
  subjectFromLookup,
  titleOf,
  useEntry,
  type Draft,
  type Place,
} from "@/lib/collection";
import { copyOf, keepCopy } from "@/lib/copies";
import type { TreeSnapshot } from "@/lib/tree";
import { RecordView, viewableFromCopy, viewableFromDocument, type Viewable } from "@/components/RecordView";
import { SaveControl } from "@/components/SaveControl";
import { HeldBy, Holdings } from "@/components/Relations";
import { ParcelMap } from "@/components/ParcelMap";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";
import { Failure, Loading, PORTAL_STAGES } from "@/components/Status";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Something that belongs to one record, tagged with which. */
type For<T> = { key: string; value: T };

/** The device's copy, read back for display. */
interface Kept {
  key: string;
  view: Viewable;
  savedAt: string;
}

/**
 * The document.
 *
 * A URL that names a record opens *as* that record: there is no form here and
 * nothing to fill in. Whatever this device kept from the last visit paints
 * first — with no signal at all, if need be — while the live copy is fetched
 * behind it and then kept in its place.
 */
export function DocumentScreen({ initial }: { initial: TreeSnapshot }) {
  const [sp, setSp] = useQueryStates(searchParams);
  const { type, district, taluka, village, mode, st, q, parcel, sankalan, purpose, duration } = sp;

  // Rebuilt only when a field that identifies the document changes, so it is a
  // safe dependency for the fetch below.
  const lookup = useMemo(
    () => lookupFrom(sp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, district, taluka, village, mode, st, q, parcel, sankalan, purpose, duration],
  );
  const key = lookup ? lookupKey(lookup) : null;
  const loc = useMemo<Locator | null>(
    () =>
      lookup
        ? { recordType: lookup.type, district: lookup.district, taluka: lookup.taluka, village: lookup.village }
        : null,
    [lookup],
  );

  /**
   * The village behind the codes. Whatever the server had cached paints first;
   * anything it did not have is fetched here, so the page never settles on bare
   * codes. A kept subject carries its own names, which is what lets this page
   * read correctly with no network at all.
   */
  const districtsRes = useResource(lookup ? `d|${lookup.type}` : null, () => api.districts(lookup!.type), initial.districts);
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
  const districts = dataOf(districtsRes);
  const talukas = dataOf(talukasRes);
  const villages = dataOf(villagesRes);
  const fromTree = useMemo<Place | null>(
    () =>
      lookup
        ? {
            district: lookup.district,
            taluka: lookup.taluka,
            village: lookup.village,
            districtName: labelOf(districts, lookup.district) ?? lookup.district,
            talukaName: labelOf(talukas, lookup.taluka) ?? lookup.taluka,
            villageName: labelOf(villages, lookup.village) ?? lookup.village,
          }
        : null,
    [lookup, districts, talukas, villages],
  );

  // The subject this document is about. Its id needs only the village *codes*,
  // so it is known before any names are resolved.
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

  /** Read on the client only: it lives in localStorage. */
  const [mobile, setMobile] = useState<string | null>(null);
  useEffect(() => setMobile(deviceMobile()), []);

  const [kept, setKept] = useState<Kept | null>(null);
  const [fetched, setFetched] = useState<For<RecordDocument> | null>(null);
  // Apart from the document, so a failed refresh leaves the last good one up.
  const [failed, setFailed] = useState<For<{ message: string; retryable: boolean }> | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);

  // The record on screen changes with the URL; a fetch for the previous one
  // may still land, so everything below is tagged with its key and read back
  // only when it matches.
  const current = useRef(key);
  current.current = key;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void copyOf(key)
      .then((copy) => copy && viewableFromCopy(copy).then((view) => ({ view, savedAt: copy.savedAt })))
      .then((found) => alive && found && setKept({ key, ...found }));
    return () => {
      alive = false;
    };
  }, [key]);

  const language = resolveLanguage(ctx, sp.lang);
  const canFetch = !!recordInput(lookup, language, mobile ?? "", resolveSearchType(ctx, lookup));

  const fetchNow = useCallback(
    async (lang?: string) => {
      const input = recordInput(
        lookup,
        resolveLanguage(ctx, lang ?? sp.lang),
        mobile ?? "",
        resolveSearchType(ctx, lookup),
      );
      if (!loc || !key || !input) return;
      setFetching(key);
      try {
        const doc = await api.record(loc, sp.mode, input);
        void keepCopy(key, doc);
        if (current.current === key) {
          setFetched({ key, value: doc });
          setFailed(null);
        }
      } catch (e) {
        if (current.current === key) setFailed({ key, value: { message: errorMessage(e), retryable: canRetry(e) } });
      } finally {
        setFetching((was) => (was === key ? null : was));
      }
    },
    [loc, key, lookup, ctx, mobile, sp.lang, sp.mode],
  );

  /**
   * Opening this page *is* the request, so it fetches on arrival — once per
   * record, as soon as the village's context and the device's number are in.
   */
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!key || !canFetch || requested.current === key) return;
    requested.current = key;
    void fetchNow();
  }, [key, canFetch, fetchNow]);

  const mine = <T extends { key: string }>(x: T | null) => (x && x.key === key ? x : null);
  const live = mine(fetched)?.value ?? null;
  const copy = mine(kept);
  const isFetching = fetching === key;

  const liveView = useMemo(() => (live ? viewableFromDocument(live) : null), [live]);
  const view = liveView ?? copy?.view ?? null;

  /**
   * An 8A *is* the list of survey numbers held under a khata, so reading the
   * document on screen — live or kept — hands over the whole holder → land
   * edge without a further request.
   */
  const holdings = useMemo(
    () => (view?.format === "html" && view.recordType === "8A" ? parseEightA(view.html).surveyNumbers : []),
    [view],
  );

  // Kept on the entry so the reverse direction works later, offline.
  useEffect(() => {
    if (holdings.length && entry?.kind === "holder") collection.setHoldings(entry.id, holdings);
  }, [holdings, entry?.id, entry?.kind]);

  // Without the village's context there is nothing to fetch with, so a failure
  // there is this screen's failure too. Held back while a retry or refresh is
  // under way, so the wait shows as a wait.
  const failure = isFetching ? null : (mine(failed)?.value ?? (contextRes.status === "error" ? contextRes : null));
  const retryFailed = contextRes.status === "error" ? contextRes.retry : () => void fetchNow();
  const retry = failure?.retryable ? retryFailed : undefined;

  const named = place && place.villageName !== place.village;
  const heading = subject ? describe(subject) : null;
  const title = entry && titleOf(entry) !== entry.code ? titleOf(entry) : heading;

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        {lookup ? (
          <>
            <Link className="back" href={searchHref(lookup, sp.lang)}>
              <span aria-hidden="true">←</span> Back to search
            </Link>
            <div className="doc-head">
              <h1 className="doc-title" lang={title !== heading ? "mr" : undefined}>
                {title ?? (
                  <span className="skeleton skeleton-text">
                    <span className="sr-only">Loading</span>
                  </span>
                )}
              </h1>
              <p className="doc-path">
                {title !== heading && heading && <span>{heading} · </span>}
                {place && named ? (
                  <span lang="mr">{placeName(place)}</span>
                ) : (
                  <span className="skeleton skeleton-text skeleton-wide">
                    <span className="sr-only">Loading place names</span>
                  </span>
                )}
              </p>
            </div>
          </>
        ) : (
          // Shaped like the not-found screen: this is one, for a record.
          <div className="gate">
            <h1 className="intro-title">This link does not name a record</h1>
            <p className="lede">It may have been cut short when it was shared.</p>
            <div className="step-actions">
              <Link className="btn btn-primary" href="/">
                Search land records
              </Link>
            </div>
          </div>
        )}

        {lookup && !view && (
          <div className="gate">
            {failure ? (
              <Failure message={failure.message} onRetry={retry} />
            ) : (
              <Loading
                size="lg"
                label={
                  contextRes.status === "loading" ? "Getting this village’s details…" : "Getting the record from Mahabhulekh…"
                }
                stages={PORTAL_STAGES}
              />
            )}
          </div>
        )}

        {/* Above the record, next to the Refresh that failed — not below a screen of document. */}
        {view && failure && <Failure message={`Could not get a newer copy. ${failure.message}`} onRetry={retry} />}

        {view && (
          <RecordView
            doc={view}
            subject={heading && place ? `${heading} ${place.villageName}` : undefined}
            meta={
              live
                ? "Fetched just now"
                : copy
                  ? `Your copy from ${when(copy.savedAt)}${isFetching ? " · checking for a newer one…" : ""}`
                  : null
            }
            actions={
              <>
                {subject && <SaveControl subject={subject} />}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void fetchNow()}
                  disabled={isFetching || !canFetch}
                  aria-busy={isFetching}
                >
                  {isFetching && <span className="spinner" aria-hidden="true" />}
                  {isFetching ? "Refreshing" : "Refresh"}
                </button>
                {ctx && ctx.languages.length > 1 && (
                  <select
                    className="sel sel-inline"
                    aria-label="Language of the record"
                    value={language}
                    disabled={isFetching}
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

        {/* 7/12s only: the map is addressed by the rural village code, and
            Bhunaksha's urban (Property Card) maps are not wired up. Held back
            while the record loads, so the loader is the only thing on screen. */}
        {place && lookup?.type === "7/12" && subject?.kind === "parcel" && (view || failure) && (
          <ParcelMap place={place} survey={subject.code} />
        )}

        {place && holdings.length > 0 && <Holdings place={place} numbers={holdings} lang={sp.lang} />}

        {place && subject?.kind === "parcel" && <HeldBy place={place} number={subject.code} lang={sp.lang} />}
      </main>

      <SiteFooter />
    </div>
  );
}

/** "Survey 167/2", "Khata 2379" — what the record is of, in words. */
function describe(subject: Draft): string {
  switch (subject.kind) {
    case "holder":
      return `Khata ${subject.code}`;
    case "measurement":
      return `Measurement ${subject.code}`;
    case "parcel":
      return `${subject.register === "PropertyCard" ? "CTS" : "Survey"} ${subject.code}`;
  }
}

const labelOf = (options: Option[] | undefined, value: string) =>
  options?.find((o) => o.value === value)?.label ?? null;

/** `place` with any name that is still just its code filled in from `names`. */
function withNames(place: Place, names: Place | null): Place {
  if (!names) return place;
  const pick = (name: string, code: string, better: string) => (name === code && better !== code ? better : name);
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
