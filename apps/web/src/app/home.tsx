"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { normalizeDigits, type Option, type RecordType, type SearchMode } from "@bhumi/core";
import { api, canRetry, errorMessage, type Locator } from "@/lib/client";
import { RECORD_LABELS, isComplete, lookupFrom, recordHref, searchParams } from "@/lib/search-params";
import { mapHref } from "@/lib/map-params";
import { useResource, dataOf, firstFailure, type Resource } from "@/lib/resource";
import { scope } from "@/lib/recents";
import { lookupFor, subjectOf, type Place } from "@/lib/collection";
import type { TreeSnapshot } from "@/lib/tree";
import { SITE } from "@/lib/site";
import { Combobox } from "@/components/Combobox";
import { Segmented } from "@/components/Segmented";
import { Results } from "@/components/Results";
import { SavedShortlist, SharedCollection } from "@/components/Collection";
import { CommandPalette } from "@/components/CommandPalette";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";
import { Failure, Loading, PORTAL_STAGES, SkeletonRows } from "@/components/Status";

const TYPES: { key: RecordType; label: string; about: string }[] = [
  { key: "7/12", label: RECORD_LABELS["7/12"], about: "Farmland: who holds it, its area and crops. By survey (gat) number or holder’s name." },
  { key: "8A", label: RECORD_LABELS["8A"], about: "Every survey number one holder has in a village, by khata number or name." },
  { key: "PropertyCard", label: RECORD_LABELS.PropertyCard, about: "Land in towns and cities, by CTS number or holder’s name." },
  { key: "KJP", label: RECORD_LABELS.KJP, about: "Changes in area recorded after a land measurement (mojani)." },
];

const MODES: { key: SearchMode; label: string }[] = [
  { key: "number", label: "By number" },
  { key: "name", label: "By name" },
];

/** Everything invalidated by a change to the location or record type. */
const CLEARED = {
  st: null,
  q: "",
  parcel: null,
  sankalan: null,
  purpose: null,
  duration: null,
  open: false,
} as const;

/**
 * English glosses for the portal's search sub-types, which it only names in
 * Marathi. Keyed by label, not value: values are positional and differ between
 * record types, the wording does not.
 */
const GLOSS: Record<string, string> = {
  "सर्वे नंबर": "Survey no.",
  "अक्षरी सर्वे नंबर": "Survey no. in words",
  "खाते क्रमांक": "Khata no.",
  "पाहिले नाव": "First name",
  "मधले नाव": "Middle name",
  "आडनाव": "Surname",
  "पूर्ण नाव": "Full name",
};
const gloss = (label: string) => GLOSS[label] ?? (/CTS/i.test(label) ? "CTS no." : label);

/**
 * Sub-types that take no query: the akshari search lists every survey number
 * written out in words, and the portal shows no text box for it.
 */
const takesNoQuery = (label: string | undefined) => !!label && label.includes("अक्षरी");

/** The surname search, which is how people actually look land up by name. */
const isSurname = (o: Option) => o.label === "आडनाव";

/** 7/12 and 8A share one cascade, so a village chosen for one is valid for the other. */
const sameCascade = (a: RecordType, b: RecordType) =>
  (a === "7/12" || a === "8A") && (b === "7/12" || b === "8A");

const labelOf = (opts: Option[], v: string | null) => opts.find((o) => o.value === v)?.label ?? null;

/** Only where a keyboard is the likely input does focus jump ahead on its own. */
const finePointer = () => matchMedia("(pointer: fine)").matches;

/** One question to the portal; the same question asked twice is answered once. */
const searchKey = (l: Locator, m: SearchMode, st: string, q: string) => `${l.recordType}|${l.village}|${m}|${st}|${q}`;

/**
 * Finding something you have not kept yet.
 *
 * This screen's whole job is to turn a village and a few characters into a list
 * of subjects. It never fetches a document: a result row *is* a link to the
 * record — and when a search finds exactly one, the record opens by itself.
 */
export function Home({ initial }: { initial: TreeSnapshot }) {
  // The entire selection path lives in the URL, so any state is shareable by
  // copying the link. Everything below is *derived* from it.
  //
  // Every deliberate choice — record type, place, mode, sub-type, a search —
  // is its own history entry, so Back retraces the user's steps. Typing is not:
  // the query box holds a draft that only reaches the URL when searched.
  const [sp, setSp] = useQueryStates(searchParams, { history: "push" });
  const {
    type: recordType,
    district,
    taluka,
    village,
    mode,
    st: searchType,
    q: query,
    sankalan,
    purpose,
    duration,
    lang,
  } = sp;

  const isKjp = recordType === "KJP";
  const router = useRouter();

  const loc = useMemo<Locator | null>(
    () => (district && taluka && village ? { recordType, district, taluka, village } : null),
    [recordType, district, taluka, village],
  );

  /**
   * Links shared before the document view existed point here and carry
   * `open=1`. Forward them once, so an old link still lands on the record.
   */
  const forwarded = useRef(false);
  useEffect(() => {
    if (forwarded.current || !sp.open) return;
    const lookup = lookupFrom(sp);
    if (!lookup || !isComplete(lookup)) return;
    forwarded.current = true;
    router.replace(recordHref(lookup, sp.lang));
  }, [sp, router]);

  // --- Reference data -------------------------------------------------------
  // Each level is its own resource keyed on the inputs that identify it, so all
  // can load concurrently and each reports its own status. `initial` is
  // whatever the server already had cached.

  const districtsRes = useResource(`d|${recordType}`, () => api.districts(recordType), initial.districts);
  const talukasRes = useResource(
    district ? `t|${recordType}|${district}` : null,
    () => api.talukas(recordType, district!),
    initial.talukas,
  );
  const villagesRes = useResource(
    district && taluka ? `v|${recordType}|${district}|${taluka}` : null,
    () => api.villages(recordType, district!, taluka!),
    initial.villages,
  );
  const contextRes = useResource(
    loc ? `c|${recordType}|${loc.district}|${loc.taluka}|${loc.village}` : null,
    () => api.context(recordType, loc!.district, loc!.taluka, loc!.village),
    initial.context,
  );
  // Occupant-name sub-types depend only on the record type, and only matter in
  // name mode, so they load lazily.
  const nameTypesRes = useResource(
    !isKjp && mode === "name" && loc ? `n|${recordType}` : null,
    () => api.nameTypes(loc!),
    initial.nameTypes,
  );

  const districts = dataOf(districtsRes) ?? NO_OPTIONS;
  const talukas = dataOf(talukasRes) ?? NO_OPTIONS;
  const villages = dataOf(villagesRes) ?? NO_OPTIONS;
  const nameTypes = dataOf(nameTypesRes) ?? NO_OPTIONS;
  const ctx = dataOf(contextRes) ?? null;

  // --- Choices: thin URL writers; the resources above react ------------------

  /** Where focus goes once the next field is ready. Keyboard users only. */
  const focusNext = useRef<string | null>(null);

  function pickType(rt: RecordType) {
    if (rt === recordType) return;
    focusNext.current = null;
    // Switching between 7/12 and 8A keeps the village: they share one cascade,
    // and looking up the same place in both registers is the common case.
    if (sameCascade(rt, recordType)) {
      void setSp({ type: rt, mode: "number", ...CLEARED });
      return;
    }
    void setSp({ type: rt, district: null, taluka: null, village: null, mode: "number", ...CLEARED });
  }

  const onDistrict = (value: string) => {
    focusNext.current = "f-taluka";
    void setSp({ district: value, taluka: null, village: null, ...CLEARED });
  };
  const onTaluka = (value: string) => {
    focusNext.current = "f-village";
    void setSp({ taluka: value, village: null, ...CLEARED });
  };
  const onVillage = (value: string) => {
    focusNext.current = "f-query";
    void setSp({ village: value, ...CLEARED });
  };

  const switchMode = (next: SearchMode) => {
    if (next === mode) return;
    void setSp({ mode: next, st: null, parcel: null, q: "" });
  };

  // A list with one entry is not a choice. Filling it in is not a step the
  // user took, so it replaces rather than pushes.
  useEffect(() => {
    if (district && !taluka && talukas.length === 1) {
      focusNext.current = "f-village";
      void setSp({ taluka: talukas[0]!.value, village: null, ...CLEARED }, { history: "replace" });
    }
  }, [district, taluka, talukas, setSp]);
  useEffect(() => {
    if (taluka && !village && villages.length === 1) {
      focusNext.current = "f-query";
      void setSp({ village: villages[0]!.value, ...CLEARED }, { history: "replace" });
    }
  }, [taluka, village, villages, setSp]);

  // Move on to the next field the moment it can take input.
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || el.disabled) return;
    focusNext.current = null;
    if (finePointer()) el.focus();
  });

  // --- Live portal results --------------------------------------------------
  const [results, setResults] = useState<Resource<Option[]>>({ status: "idle" });
  // Guards against an older search landing after a newer one.
  const searchSeq = useRef(0);

  // Warm the live session in the background so the first search is fast.
  const primedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ctx || !loc) return;
    const key = `${loc.recordType}|${loc.district}|${loc.taluka}|${loc.village}|${mode}`;
    if (primedFor.current !== key) {
      primedFor.current = key;
      api.prime(loc, mode);
    }
  }, [ctx, loc, mode]);

  const activeSearchTypes = mode === "name" ? nameTypes : (ctx?.searchTypes ?? NO_OPTIONS);
  // Name search defaults to surname; number search to the plain survey/khata number.
  const defaultSearchType =
    (mode === "name" ? activeSearchTypes.find(isSurname) : undefined)?.value ??
    activeSearchTypes[0]?.value ??
    null;
  // A link can carry a sub-type from another record type or mode; only trust
  // one this village actually offers.
  const validSearchType = activeSearchTypes.some((o) => o.value === searchType) ? searchType : null;
  const subTypeLabel = activeSearchTypes.find((o) => o.value === validSearchType)?.label;
  const needsQuery = !takesNoQuery(subTypeLabel);

  // Default the search sub-type whenever it is unset or not on offer here.
  useEffect(() => {
    if (isKjp || !defaultSearchType || validSearchType) return;
    // Filling in a default is not a step the user took.
    void setSp({ st: defaultSearchType }, { history: "replace" });
  }, [defaultSearchType, validSearchType, isKjp, setSp]);

  /** The search the user just asked for, as opposed to one replayed by Back. */
  const asked = useRef<string | null>(null);

  const runSearch = useCallback(async (l: Locator, m: SearchMode, st: string, q: string) => {
    const seq = ++searchSeq.current;
    setResults({ status: "loading" });
    try {
      const rows = await api.search(l, m, st, q);
      if (seq === searchSeq.current) setResults({ status: "ready", data: rows });
    } catch (e) {
      if (seq !== searchSeq.current) return;
      // A failed search opens nothing, even if Back later replays it.
      asked.current = null;
      setResults({ status: "error", message: errorMessage(e), retryable: canRetry(e) });
    }
  }, []);

  const searching = results.status === "loading";
  const clean = (s: string) => (mode === "number" ? normalizeDigits(s) : s).trim();

  /** What is in the box, which becomes `q` when searched. */
  const [draft, setDraft] = useState(query);
  // Back and forward move `q`; the box follows.
  useEffect(() => setDraft(query), [query]);

  const canSearch = !!loc && !!validSearchType && (!needsQuery || clean(draft).length > 0);

  const queryRef = useRef<HTMLInputElement>(null);
  const onSearch = () => {
    if (!loc || !validSearchType || !canSearch || searching) return;
    const q = needsQuery ? clean(draft) : "";
    asked.current = searchKey(loc, mode, validSearchType, q);
    // On a phone, put the keyboard away so the answer has the screen.
    if (!finePointer()) queryRef.current?.blur();
    // A new question is a new history entry; the effect below answers it.
    // Asking the same one again just re-runs it.
    if (q !== query) void setSp({ q, parcel: null });
    else void runSearch(loc, mode, validSearchType, q);
  };

  /**
   * The question in the URL is answered whenever it changes — arriving from a
   * shared link, Back from a record, Back to an earlier search, switching the
   * sub-type. Answers are memoised, so moving through history costs the portal
   * nothing.
   */
  const answered = useRef<string | null>(null);
  const cleanQuery = needsQuery ? clean(query) : "";
  useEffect(() => {
    if (!loc || !validSearchType || (needsQuery && !cleanQuery)) {
      // Back to before anything was searched: no stale rows.
      answered.current = null;
      searchSeq.current++;
      setResults({ status: "idle" });
      return;
    }
    const key = searchKey(loc, mode, validSearchType, cleanQuery);
    if (answered.current === key) return;
    answered.current = key;
    void runSearch(loc, mode, validSearchType, cleanQuery);
  }, [loc, mode, validSearchType, cleanQuery, needsQuery, runSearch]);

  // The chosen path, resolved back to readable labels.
  const place = useMemo<Place | null>(
    () =>
      loc
        ? {
            district: loc.district,
            taluka: loc.taluka,
            village: loc.village,
            districtName: labelOf(districts, loc.district) ?? loc.district,
            talukaName: labelOf(talukas, loc.taluka) ?? loc.taluka,
            villageName: labelOf(villages, loc.village) ?? loc.village,
          }
        : null,
    [loc, districts, talukas, villages],
  );

  const parcels = dataOf(results) ?? NO_OPTIONS;
  const noResults = results.status === "ready" && parcels.length === 0;
  const route = useMemo(
    () => (needsQuery || !validSearchType ? undefined : { st: validSearchType, q: "" }),
    [needsQuery, validSearchType],
  );

  /**
   * A search that finds exactly one thing has nothing left to choose — open
   * it. Only for a search the user just ran: arriving back here from that
   * record must show the list, not bounce forward again.
   */
  useEffect(() => {
    if (results.status !== "ready" || !place || !asked.current) return;
    if (asked.current !== answered.current) return;
    asked.current = null;
    if (results.data.length !== 1) return;
    const subject = subjectOf(place, recordType, results.data[0]!);
    if (!subject) return;
    router.push(recordHref({ ...lookupFor(subject), ...route }, lang));
  }, [results, place, recordType, route, lang, router]);

  // The portal always returns a `kjp` block for a KJP village, but any of its
  // three lists can come back empty — and all three are required to request a
  // record, so an empty one means this village simply has nothing to offer.
  const kjp = ctx?.kjp;
  const kjpUsable = !!kjp && kjp.sankalan.length > 0 && kjp.purpose.length > 0 && kjp.duration.length > 0;
  const kjpLookup = lookupFrom(sp);
  const kjpReady = isKjp && !!kjpLookup && isComplete(kjpLookup);
  const kjpMissing = [
    !sankalan && "scheme",
    !purpose && "purpose",
    !duration && "priority",
    !query.trim() && "measurement number",
  ].filter(Boolean);

  // Search failures are shown by the search box; this is for the form itself.
  const failure = firstFailure(districtsRes, talukasRes, villagesRes, contextRes, nameTypesRes);
  const searchError = results.status === "error" ? results : null;
  const noVillages = villagesRes.status === "ready" && villages.length === 0;
  const isPc = recordType === "PropertyCard";
  const latinName = mode === "name" && /[a-z]/i.test(draft);
  const about = TYPES.find((t) => t.key === recordType)?.about;
  const rural = sameCascade(recordType, "7/12");
  const nameTypesLoading = mode === "name" && nameTypesRes.status === "loading";

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        <div className="intro">
          <h1 className="intro-title">{SITE.tagline}</h1>
          <p className="lede">
            7/12, 8A and Property Card extracts from Mahabhulekh, by survey number or owner name.{" "}
            <span lang="mr">सातबारा उतारा · ८अ · मिळकत पत्रिका</span>
          </p>
        </div>

        <Suspense fallback={null}>
          <SharedCollection />
        </Suspense>

        <SavedShortlist />

        <section className="step" aria-labelledby="step-1">
          <div className="step-head">
            {/* A record type is always chosen, so this step is always done. */}
            <span className="step-num" aria-hidden="true" data-done>
              1
            </span>
            <h2 className="step-title" id="step-1">
              Which record?
            </h2>
          </div>
          <Segmented items={TYPES} value={recordType} onChange={pickType} labelledBy="step-1" describedBy="type-about" />
          <p className="help" id="type-about">
            {about}
          </p>
        </section>

        <section className="step" aria-labelledby="step-2">
          <div className="step-head">
            <span className="step-num" aria-hidden="true" data-done={!!village || undefined}>
              2
            </span>
            <h2 className="step-title" id="step-2">
              Where is the land?
            </h2>
            {rural && district && taluka && (
              <Link className="step-link" href={mapHref({ district, taluka, village })}>
                Find on map
              </Link>
            )}
          </div>

          <div className="row">
            <div className="field">
              <label className="lbl" htmlFor="f-district">
                District
              </label>
              <Combobox
                id="f-district"
                noun="districts"
                options={districts}
                value={district}
                onChange={onDistrict}
                placeholder="Choose district"
                loading={districtsRes.status === "loading"}
                disabled={districts.length === 0}
                recentScope={scope(recordType)}
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="f-taluka">
                {isPc ? "Land records office" : "Taluka"}
              </label>
              <Combobox
                id="f-taluka"
                noun={isPc ? "offices" : "talukas"}
                options={talukas}
                value={taluka}
                onChange={onTaluka}
                placeholder={district ? (isPc ? "Choose office" : "Choose taluka") : "Choose district first"}
                loading={talukasRes.status === "loading"}
                disabled={!district}
                recentScope={district ? scope(recordType, district) : undefined}
              />
            </div>
          </div>

          <div className="field">
            <label className="lbl" htmlFor="f-village">
              Village
            </label>
            <Combobox
              id="f-village"
              noun="villages"
              options={villages}
              value={village}
              onChange={onVillage}
              placeholder={taluka ? "Choose village — type to filter" : isPc ? "Choose office first" : "Choose taluka first"}
              loading={villagesRes.status === "loading"}
              disabled={!taluka || noVillages}
              recentScope={district && taluka ? scope(recordType, district, taluka) : undefined}
            />
            {noVillages && (
              <p className="help">
                {isPc
                  ? "This office has no villages with Property Cards online. Try another office."
                  : "No villages are listed here. Try another taluka."}
              </p>
            )}
          </div>
        </section>

        {loc && (
          <section className="step" aria-labelledby="step-3" aria-busy={contextRes.status === "loading" || undefined}>
            <div className="step-head">
              <span className="step-num" aria-hidden="true">
                3
              </span>
              <h2 className="step-title" id="step-3">
                {isKjp ? "Which measurement?" : recordType === "8A" ? "Find the holder" : "Find the land"}
              </h2>
              {ctx && !isKjp && (
                <Segmented items={MODES} value={mode} onChange={switchMode} labelledBy="step-3" compact />
              )}
            </div>

            {contextRes.status === "loading" && (
              <Loading
                label="Getting this village’s search options…"
                stages={[[5, "The first visit to a village asks Mahabhulekh; after that it is instant."]]}
              />
            )}

            {ctx && !isKjp && (
              <>
                {nameTypesLoading && <Loading size="sm" label="Loading name search options…" />}

                {activeSearchTypes.length > 1 && (
                  <div className="field">
                    <span className="lbl" id="lbl-searchtype">
                      Search by
                    </span>
                    <Segmented
                      items={activeSearchTypes.map((o) => ({ key: o.value, label: gloss(o.label) }))}
                      value={validSearchType ?? ""}
                      onChange={(st) => void setSp({ st, parcel: null })}
                      labelledBy="lbl-searchtype"
                    />
                  </div>
                )}

                <div className="field">
                  {needsQuery ? (
                    <label className="lbl" htmlFor="f-query">
                      {mode === "name"
                        ? `${gloss(subTypeLabel ?? "आडनाव")} (in Marathi)`
                        : gloss(subTypeLabel ?? (recordType === "8A" ? "खाते क्रमांक" : "सर्वे नंबर"))}
                    </label>
                  ) : (
                    <p className="help help-top">Lists every survey number in this village that is written in words.</p>
                  )}
                  <form
                    className="search-group"
                    role="search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSearch();
                    }}
                  >
                    {needsQuery && (
                      <input
                        ref={queryRef}
                        id="f-query"
                        className="inp"
                        type="search"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        inputMode={mode === "number" ? "numeric" : "text"}
                        autoComplete="off"
                        enterKeyHint="search"
                        lang={mode === "name" ? "mr" : undefined}
                        aria-invalid={!!searchError || noResults || undefined}
                        aria-describedby="f-query-help"
                        disabled={nameTypesLoading}
                        placeholder={mode === "name" ? "उदा. पाटील" : recordType === "8A" ? "e.g. 23" : "e.g. 167"}
                      />
                    )}
                    <button type="submit" className="btn btn-primary" disabled={searching || !canSearch} aria-busy={searching}>
                      {searching && <span className="spinner" aria-hidden="true" />}
                      {searching ? "Searching" : needsQuery ? "Search" : "List all"}
                    </button>
                  </form>
                  <div id="f-query-help" aria-live="polite">
                    {searchError ? null : noResults ? (
                      <p className="help" data-invalid="true">
                        {mode === "name"
                          ? "No one by that name here. Names must be typed in Marathi, as on the record — try just the surname."
                          : "Nothing matched. Type the start of the number: 12 finds 12, 120, 12/1…"}
                      </p>
                    ) : latinName ? (
                      <p className="help">The portal only matches names in Marathi — type पाटील, not Patil.</p>
                    ) : mode === "number" && needsQuery && !searching ? (
                      <p className="help">Type the start of the number; every sub-division is listed.</p>
                    ) : null}
                  </div>
                </div>

                {searching && (
                  <div>
                    <Loading label="Searching Mahabhulekh…" stages={PORTAL_STAGES} />
                    <SkeletonRows rows={3} />
                  </div>
                )}

                {searchError && !searching && (
                  <Failure
                    message={searchError.message}
                    onRetry={
                      searchError.retryable && loc && validSearchType
                        ? () => void runSearch(loc, mode, validSearchType, cleanQuery)
                        : undefined
                    }
                  />
                )}

                {place && parcels.length > 0 && !searching && (
                  <Results
                    place={place}
                    type={recordType}
                    options={parcels}
                    lang={lang}
                    route={route}
                  />
                )}
              </>
            )}

            {ctx && isKjp && kjpUsable && kjp && (
              <>
                <div className="row">
                  <KjpSelect id="f-sankalan" label="Scheme" options={kjp.sankalan} value={sankalan} onChange={(v) => void setSp({ sankalan: v })} />
                  <KjpSelect id="f-purpose" label="Purpose" options={kjp.purpose} value={purpose} onChange={(v) => void setSp({ purpose: v })} />
                </div>
                <div className="row">
                  <KjpSelect id="f-duration" label="Priority" options={kjp.duration} value={duration} onChange={(v) => void setSp({ duration: v })} />
                  <div className="field">
                    <label className="lbl" htmlFor="f-query">
                      Measurement number
                    </label>
                    <input
                      id="f-query"
                      className="inp"
                      value={query}
                      onChange={(e) => void setSp({ q: e.target.value }, { history: "replace" })}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Mojani number"
                    />
                  </div>
                </div>
                <div className="step-actions">
                  {kjpReady && kjpLookup ? (
                    <Link className="btn btn-primary" href={recordHref(kjpLookup, lang)}>
                      Open record
                    </Link>
                  ) : (
                    <>
                      <button type="button" className="btn btn-primary" disabled>
                        Open record
                      </button>
                      <p className="help">Still needed: {kjpMissing.join(", ")}.</p>
                    </>
                  )}
                </div>
              </>
            )}

            {ctx && isKjp && !kjpUsable && <p className="help">This village has no Kami-Jasti lists.</p>}
          </section>
        )}

        {failure && <Failure message={failure.message} onRetry={failure.retryable ? failure.retry : undefined} />}
      </main>

      <SiteFooter />
      <CommandPalette />
    </div>
  );
}

const NO_OPTIONS: Option[] = [];

function KjpSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="sel" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose {label.toLowerCase()}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
