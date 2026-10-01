"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { normalizeDigits, type Option, type RecordType, type SearchMode } from "@bhumi/core";
import { api, type Locator } from "@/lib/client";
import { isComplete, lookupFrom, recordHref, searchParams } from "@/lib/search-params";
import { useResource, dataOf, firstError, type Resource } from "@/lib/resource";
import type { Place } from "@/lib/collection";
import type { TreeSnapshot } from "@/lib/tree";
import { Combobox } from "@/components/Combobox";
import { Segmented } from "@/components/Segmented";
import { Results } from "@/components/Results";
import { Collection, SharedCollection } from "@/components/Collection";
import { CommandPalette } from "@/components/CommandPalette";

const TYPES: { key: RecordType; label: string }[] = [
  { key: "7/12", label: "7/12" },
  { key: "8A", label: "8A" },
  { key: "PropertyCard", label: "Property Card" },
  { key: "KJP", label: "Kami-Jasti" },
];

const MODES: { key: SearchMode; label: string }[] = [
  { key: "number", label: "Number" },
  { key: "name", label: "Name" },
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

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

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
const gloss = (label: string) =>
  GLOSS[label] ?? (/CTS/i.test(label) ? "CTS no." : label);

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

/**
 * Finding something you have not kept yet.
 *
 * This screen's whole job is to turn a village and a few characters into a list
 * of subjects. It never fetches a document: a result row *is* a link to the
 * record, so there is no third step to fill in and nothing to submit. That is
 * also why the mobile number and the language live on the document screen —
 * they are properties of a fetch, and no fetch happens here.
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

  // Memoised so it is a stable dependency for the effects below.
  const loc = useMemo<Locator | null>(
    () => (district && taluka && village ? { recordType, district, taluka, village } : null),
    [recordType, district, taluka, village],
  );

  /**
   * Links shared before the document view existed point here and carry
   * `open=1`. Forward them once, so an old link still lands on the record
   * rather than on a form pretending to load one.
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
  // four can load concurrently and each reports its own status. `initial` is
  // whatever the server already had cached, which lets the first render skip
  // the fetch entirely.

  const districtsRes = useResource(
    `d|${recordType}`,
    () => api.districts(recordType),
    initial.districts,
  );
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

  const districts = dataOf(districtsRes) ?? [];
  const talukas = dataOf(talukasRes) ?? [];
  const villages = dataOf(villagesRes) ?? [];
  const nameTypes = dataOf(nameTypesRes) ?? [];
  const ctx = dataOf(contextRes) ?? null;

  // --- Live portal results --------------------------------------------------
  const [results, setResults] = useState<Resource<Option[]>>({ status: "idle" });
  // Guards against an older search landing after a newer one.
  const searchSeq = useRef(0);

  // Stale results the moment the question changes.
  useEffect(() => {
    searchSeq.current++;
    setResults({ status: "idle" });
  }, [loc, mode, recordType]);

  // Warm the live session in the background so the first search is fast.
  const primedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ctx || !loc) return;
    const key = `${loc.recordType}|${loc.district}|${loc.taluka}|${loc.village}`;
    if (primedFor.current !== key) {
      primedFor.current = key;
      api.prime(loc);
    }
  }, [ctx, loc]);

  const activeSearchTypes = mode === "name" ? nameTypes : ctx?.searchTypes ?? [];
  // Name search defaults to surname; number search to the plain survey/khata number.
  const defaultSearchType =
    (mode === "name" ? activeSearchTypes.find(isSurname) : undefined)?.value ??
    activeSearchTypes[0]?.value ??
    null;
  // A link can carry a sub-type from another record type or mode; only trust
  // one this village actually offers.
  const validSearchType = activeSearchTypes.some((o) => o.value === searchType)
    ? searchType
    : null;
  const subTypeLabel = activeSearchTypes.find((o) => o.value === validSearchType)?.label;
  const needsQuery = !takesNoQuery(subTypeLabel);

  // Default the search sub-type whenever it is unset or not on offer here.
  useEffect(() => {
    if (isKjp || !defaultSearchType || validSearchType) return;
    if (activeSearchTypes.length === 0) return;
    // Filling in a default is not a step the user took.
    void setSp({ st: defaultSearchType }, { history: "replace" });
  }, [defaultSearchType, validSearchType, activeSearchTypes.length, isKjp, setSp]);

  const runSearch = useCallback(async (l: Locator, m: SearchMode, st: string, q: string) => {
    const seq = ++searchSeq.current;
    setResults({ status: "loading" });
    try {
      const rows = await api.search(l, m, st, q);
      if (seq === searchSeq.current) setResults({ status: "ready", data: rows });
    } catch (e) {
      if (seq === searchSeq.current) setResults({ status: "error", message: msg(e) });
    }
  }, []);

  const searching = results.status === "loading";

  const clean = (s: string) => (mode === "number" ? normalizeDigits(s) : s).trim();

  /** What is in the box, which becomes `q` when searched. */
  const [draft, setDraft] = useState(query);
  // Back and forward move `q`; the box follows.
  useEffect(() => setDraft(query), [query]);

  const canSearch = !!loc && !!validSearchType && (!needsQuery || clean(draft).length > 0);

  const onSearch = () => {
    if (!canSearch || searching) return;
    const q = needsQuery ? clean(draft) : "";
    // A new question is a new history entry; the effect below answers it.
    // Asking the same one again just re-runs it.
    if (q !== query) void setSp({ q, parcel: null });
    else void runSearch(loc!, mode, validSearchType!, q);
  };

  /**
   * The question in the URL is answered whenever it changes — arriving from a
   * shared link, Back from a record, Back to an earlier search, switching the
   * sub-type. Answers are memoised, so moving through history costs the portal
   * nothing.
   */
  const answered = useRef<string | null>(null);
  useEffect(() => {
    if (!loc || !validSearchType || (needsQuery && !query)) {
      // Back to before anything was searched: no stale rows.
      answered.current = null;
      searchSeq.current++;
      setResults({ status: "idle" });
      return;
    }
    const q = needsQuery ? clean(query) : "";
    const key = `${loc.recordType}|${loc.village}|${mode}|${validSearchType}|${q}`;
    if (answered.current === key) return;
    answered.current = key;
    void runSearch(loc, mode, validSearchType, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, mode, validSearchType, query, needsQuery]);

  // --- Handlers: thin URL writers; the resources above react ------------------

  function pickType(rt: RecordType) {
    if (rt === recordType) return;
    // Switching between 7/12 and 8A keeps the village: they share one cascade,
    // and looking up the same place in both registers is the common case.
    if (sameCascade(rt, recordType)) {
      setSp({ type: rt, mode: "number", ...CLEARED });
      return;
    }
    setSp({ type: rt, district: null, taluka: null, village: null, mode: "number", ...CLEARED });
  }

  const onDistrict = (value: string) =>
    setSp({ district: value, taluka: null, village: null, ...CLEARED });
  const onTaluka = (value: string) => setSp({ taluka: value, village: null, ...CLEARED });
  const onVillage = (value: string) => setSp({ village: value, ...CLEARED });

  const switchMode = (next: SearchMode) => {
    if (next === mode) return;
    setSp({ mode: next, st: null, parcel: null, q: "" });
  };

  // The chosen path, resolved back to readable labels.
  const labelOf = (opts: Option[], v: string | null) =>
    opts.find((o) => o.value === v)?.label ?? null;

  /**
   * The place names behind the codes, so a kept subject reads as
   * "सांगली › वाळवा › बोरगांव" on a device that has never met this village.
   */
  const place = useMemo<Place | null>(
    () =>
      loc
        ? {
            district: loc.district,
            taluka: loc.taluka,
            village: loc.village,
            districtName: labelOf(districts, district) ?? loc.district,
            talukaName: labelOf(talukas, taluka) ?? loc.taluka,
            villageName: labelOf(villages, village) ?? loc.village,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loc, districts, talukas, villages, district, taluka, village],
  );

  const path = [
    labelOf(districts, district),
    labelOf(talukas, taluka),
    labelOf(villages, village),
  ].filter((x): x is string => !!x);

  const parcels = dataOf(results) ?? [];
  const noResults = results.status === "ready" && parcels.length === 0;

  // The portal always returns a `kjp` block for a KJP village, but any of its
  // three lists can come back empty — and all three are required to request a
  // record, so an empty one means this village simply has nothing to offer.
  const kjp = ctx?.kjp;
  const kjpUsable =
    !!kjp && kjp.sankalan.length > 0 && kjp.purpose.length > 0 && kjp.duration.length > 0;
  const kjpLookup = lookupFrom(sp);
  const kjpReady = isKjp && !!kjpLookup && isComplete(kjpLookup);

  // Search failures are shown by the search box; this is for the form itself.
  const error = firstError(districtsRes, talukasRes, villagesRes, contextRes, nameTypesRes);
  const searchError = results.status === "error" ? results.message : null;
  const noVillages = villagesRes.status === "ready" && villages.length === 0;
  const isPc = recordType === "PropertyCard";
  const latinName = mode === "name" && /[a-z]/i.test(draft);

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">Bhumi</h1>
        <span className="source">Mahabhulekh</span>
      </header>
      <p className="lede">
        Maharashtra 7/12, 8A and Property Card extracts from Mahabhulekh, by survey number or
        owner name. <span lang="mr">सातबारा उतारा · ८अ · मिळकत पत्रिका</span>
      </p>

      <Suspense fallback={null}>
        <SharedCollection />
      </Suspense>

      <Collection />

      <div className="picker">
        <span className="lbl" id="lbl-type">
          Record
        </span>
        <Segmented items={TYPES} value={recordType} onChange={pickType} labelledBy="lbl-type" />
      </div>

      <section className="step" data-state={village ? "done" : "active"} aria-labelledby="step-1">
        <div className="step-head">
          <h2 className="step-title" id="step-1">
            Village
          </h2>
          {path.length > 0 && (
            <p className="step-note" lang="mr">
              {path.join(" › ")}
            </p>
          )}
        </div>

        <div className="row">
          <div className="field">
            <label className="lbl" htmlFor="f-district">
              District
            </label>
            <Combobox
              id="f-district"
              options={districts}
              value={district}
              onChange={onDistrict}
              placeholder="District"
              loading={districtsRes.status === "loading"}
              disabled={districts.length === 0}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="f-taluka">
              {isPc ? "Office" : "Taluka"}
            </label>
            <Combobox
              id="f-taluka"
              options={talukas}
              value={taluka}
              onChange={onTaluka}
              placeholder={isPc ? "Land records office" : "Taluka"}
              loading={talukasRes.status === "loading"}
              disabled={!district || talukasRes.status === "loading"}
            />
          </div>
        </div>

        <div className="field">
          <label className="lbl" htmlFor="f-village">
            Village
          </label>
          <Combobox
            id="f-village"
            options={villages}
            value={village}
            onChange={onVillage}
            placeholder="Village"
            loading={villagesRes.status === "loading"}
            disabled={!taluka || villagesRes.status === "loading" || noVillages}
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

      {ctx && !isKjp && (
        <section className="step" aria-labelledby="step-2">
          <div className="step-head">
            <h2 className="step-title" id="step-2">
              {recordType === "8A" ? "Holder" : "Parcel"}
            </h2>
            <Segmented items={MODES} value={mode} onChange={switchMode} labelledBy="step-2" />
          </div>

          {activeSearchTypes.length > 1 && (
            <div className="field">
              <span className="lbl" id="lbl-searchtype">
                Search by
              </span>
              <Segmented
                items={activeSearchTypes.map((o) => ({ key: o.value, label: gloss(o.label) }))}
                value={validSearchType ?? ""}
                onChange={(st) => setSp({ st, parcel: null })}
                labelledBy="lbl-searchtype"
              />
            </div>
          )}

          <div className="field">
            {needsQuery ? (
              <label className="lbl" htmlFor="f-query">
                {mode === "name"
                  ? `${gloss(subTypeLabel ?? "आडनाव")} (in Marathi)`
                  : gloss(subTypeLabel ?? "")}
              </label>
            ) : (
              <p className="help">Lists every survey number in this village that is written in words.</p>
            )}
            <div className="search-group">
              {needsQuery && (
                <input
                  id="f-query"
                  className="inp"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                  inputMode={mode === "number" ? "numeric" : "text"}
                  autoComplete="off"
                  enterKeyHint="search"
                  lang={mode === "name" ? "mr" : undefined}
                  aria-invalid={!!searchError || noResults || undefined}
                  aria-describedby="f-query-help"
                  placeholder={mode === "name" ? "उदा. पाटील" : recordType === "8A" ? "e.g. 23" : "e.g. 167"}
                />
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSearch}
                disabled={searching || !canSearch}
              >
                {searching ? (
                  <span className="spinner" aria-hidden="true" />
                ) : needsQuery ? (
                  "Search"
                ) : (
                  "List all"
                )}
              </button>
            </div>
            <div id="f-query-help" aria-live="polite">
              {searching ? (
                <p className="help">Asking Mahabhulekh… this usually takes a few seconds.</p>
              ) : searchError ? (
                <p className="help" data-invalid="true">
                  {searchError}
                </p>
              ) : noResults ? (
                <p className="help" data-invalid="true">
                  {mode === "name"
                    ? "No one by that name here. Names must be typed in Marathi, exactly as on the record."
                    : "Nothing matched. Number search matches from the start: 12 finds 12, 120, 12/1…"}
                </p>
              ) : latinName ? (
                <p className="help">
                  The portal only matches names in Devanagari — type पाटील, not Patil.
                </p>
              ) : mode === "number" && needsQuery ? (
                <p className="help">
                  Type the start of the number; every sub-division is listed.
                </p>
              ) : null}
            </div>
          </div>

          {place && parcels.length > 0 && (
            <Results
              place={place}
              type={recordType}
              options={parcels}
              lang={lang}
              route={needsQuery || !validSearchType ? undefined : { st: validSearchType, q: "" }}
            />
          )}
        </section>
      )}

      {ctx && isKjp && kjpUsable && kjp && (
        <section className="step" aria-labelledby="step-2">
          <div className="step-head">
            <h2 className="step-title" id="step-2">
              Measurement
            </h2>
          </div>
          <div className="row">
            <div className="field">
              <label className="lbl" htmlFor="f-sankalan">
                Scheme
              </label>
              <select
                id="f-sankalan"
                className="sel"
                value={sankalan ?? ""}
                onChange={(e) => setSp({ sankalan: e.target.value })}
              >
                <option value="">Scheme</option>
                {kjp.sankalan.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="f-purpose">
                Purpose
              </label>
              <select
                id="f-purpose"
                className="sel"
                value={purpose ?? ""}
                onChange={(e) => setSp({ purpose: e.target.value })}
              >
                <option value="">Purpose</option>
                {kjp.purpose.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label className="lbl" htmlFor="f-duration">
                Priority
              </label>
              <select
                id="f-duration"
                className="sel"
                value={duration ?? ""}
                onChange={(e) => setSp({ duration: e.target.value })}
              >
                <option value="">Priority</option>
                {kjp.duration.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="f-mojani">
                Number
              </label>
              <input
                id="f-mojani"
                className="inp"
                value={query}
                onChange={(e) => void setSp({ q: e.target.value }, { history: "replace" })}
                inputMode="numeric"
                placeholder="Mojani number"
              />
            </div>
          </div>
          {kjpReady && kjpLookup && (
            <div className="record-actions">
              <Link className="btn btn-primary" href={recordHref(kjpLookup, lang)}>
                Open
              </Link>
            </div>
          )}
        </section>
      )}

      {ctx && isKjp && !kjpUsable && (
        <p className="help">This village has no Kami-Jasti lists.</p>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <CommandPalette />
    </div>
  );
}
