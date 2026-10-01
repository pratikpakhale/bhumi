import { describe, expect, it, vi } from "vitest";
import type { Lookup } from "./search-params";
import { lookupKey } from "./search-params";

/**
 * The store reads `localStorage` behind a `typeof window` guard and caches the
 * parsed list in module scope, so each case gets a fresh module over a fresh
 * fake storage. A real DOM would buy nothing here: none of this touches one.
 */
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {} },
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

type Module = typeof import("./collection");

async function load(seed?: Record<string, unknown>): Promise<Module> {
  store.clear();
  for (const [key, value] of Object.entries(seed ?? {})) store.set(key, JSON.stringify(value));
  vi.resetModules();
  return import("./collection");
}

const PLACE = {
  district: "35",
  taluka: "2",
  village: "273500020431150000",
  districtName: "सांगली",
  talukaName: "वाळवा",
  villageName: "बोरगांव",
};

describe("identity", () => {
  it("is the subject, not the route taken to it", async () => {
    const { collection, subjectOf } = await load();
    // The portal reaches parcel 167/2 by typing a number and by searching a
    // surname. Two routes, one parcel.
    collection.save(subjectOf(PLACE, "7/12", { value: "167/2", label: "167/2" })!);
    collection.save(subjectOf(PLACE, "7/12", { value: "167/2", label: "167/2" })!);
    expect(collection.all()).toHaveLength(1);
  });

  it("keeps a parcel and a holder apart even when the codes collide", async () => {
    const { collection } = await load();
    collection.save({ kind: "parcel", code: "2379", place: PLACE });
    collection.save({ kind: "holder", code: "2379", place: PLACE });
    expect(collection.all()).toHaveLength(2);
  });

  it("normalises Devanagari digits into one code", async () => {
    const { normalizeCode } = await load();
    expect(normalizeCode("१६७/२")).toBe("167/2");
    expect(normalizeCode("167 / 2")).toBe("167/2");
  });
});

describe("addressing", () => {
  it("searches a parcel by its stem and picks the sub-division out", async () => {
    const { parcelLookup } = await load();
    const lookup = parcelLookup(PLACE, "167/2");
    // The portal's number search matches the भूमापन क्रमांक only.
    expect(lookup.q).toBe("167");
    expect(lookup.parcel).toBe("167/2");
    expect(lookup.type).toBe("7/12");
    // Left for the village's own context to fill in.
    expect(lookup.st).toBeNull();
  });

  it("addresses a holder by khata number, which is also the option value", async () => {
    const { lookupFor, subjectOf } = await load();
    const holder = subjectOf(PLACE, "8A", {
      value: "2379",
      label: "प्रकाश विलास पाखले ( 2379 )",
    })!;
    expect(holder).toMatchObject({ kind: "holder", code: "2379", name: "प्रकाश विलास पाखले" });
    expect(lookupFor(holder)).toMatchObject({
      type: "8A",
      mode: "number",
      q: "2379",
      parcel: "2379",
    });
  });

  it("reads a khata-number search's bare label as no name at all", async () => {
    const { subjectOf } = await load();
    expect(subjectOf(PLACE, "8A", { value: "1918", label: "1918" })!.name).toBeUndefined();
  });

  it("reads a 7/12 name-search row as the parcel it names", async () => {
    // The portal posts these rows by their whole label, so the survey number has
    // to come out of it — and a parcel found by name must be the same subject
    // as one found by number.
    const { lookupFor, subjectOf } = await load();
    const label = "काशिनाथ तुकाराम गडदे ( 109 ) [ 23 ]";
    const parcel = subjectOf(PLACE, "7/12", { value: label, label })!;
    expect(parcel).toMatchObject({ kind: "parcel", code: "109", name: "काशिनाथ तुकाराम गडदे" });
    expect(lookupFor(parcel)).toMatchObject({ mode: "number", q: "109", parcel: "109" });
  });

  it("round-trips a lookup back to the subject it is about", async () => {
    const { lookupFor, subjectFromLookup } = await load();
    const parcel = { kind: "parcel", code: "167/2", place: PLACE } as const;
    expect(subjectFromLookup(PLACE, lookupFor(parcel))).toMatchObject(parcel);
  });

  it("opens a parcel in the register that found it", async () => {
    const { lookupFor, subjectOf, viewOf } = await load();
    const option = { value: "167/2", label: "167/2" };
    const land = subjectOf(PLACE, "7/12", option)!;
    const card = subjectOf(PLACE, "PropertyCard", option)!;
    expect([viewOf(land), lookupFor(land).type]).toEqual(["7/12", "7/12"]);
    expect([viewOf(card), lookupFor(card).type]).toEqual(["PropertyCard", "PropertyCard"]);
  });

  it("keeps the register across a save, so a reopen uses the codes that found it", async () => {
    // The two cascades return different district lists, so a place's codes only
    // address a village under the register they came from. Reopening a saved
    // Property Card as a 7/12 would point its codes at the wrong district.
    const { collection, lookupFor, subjectOf } = await load();
    const card = subjectOf(PLACE, "PropertyCard", { value: "167/2", label: "167/2" })!;
    const saved = collection.save(card);
    expect(lookupFor(saved).type).toBe("PropertyCard");
  });
});

describe("the person ↔ land edge", () => {
  it("reads holdings backwards, with no request", async () => {
    const { collection, holdersOf } = await load();
    const holder = collection.save({
      kind: "holder",
      code: "2379",
      place: PLACE,
      name: "प्रकाश विलास पाखले",
    });
    collection.setHoldings(holder.id, ["167/2", "१६८"]);

    expect(holdersOf(collection.all(), PLACE, "167/2")).toHaveLength(1);
    // An 8A prints Devanagari; the 7/12 dropdown does not. Still one number.
    expect(holdersOf(collection.all(), PLACE, "168")).toHaveLength(1);
    expect(holdersOf(collection.all(), PLACE, "999")).toHaveLength(0);
  });

  it("keeps holdings and the user's own name through a re-save", async () => {
    const { collection, titleOf } = await load();
    const holder = collection.save({ kind: "holder", code: "2379", place: PLACE });
    collection.setHoldings(holder.id, ["167/2"]);
    collection.update(holder.id, { nickname: "आजोबा" });
    collection.save({ kind: "holder", code: "2379", place: PLACE });

    const after = collection.get(holder.id)!;
    expect(after.kind === "holder" && after.holds).toEqual(["167/2"]);
    expect(titleOf(after)).toBe("आजोबा");
  });

  it("does not reach across villages", async () => {
    const { collection, holdersOf } = await load();
    const holder = collection.save({ kind: "holder", code: "2379", place: PLACE });
    collection.setHoldings(holder.id, ["167/2"]);
    const elsewhere = { ...PLACE, village: "999", villageName: "अन्य" };
    expect(holdersOf(collection.all(), elsewhere, "167/2")).toHaveLength(0);
  });
});

describe("migrating the v1 collection", () => {
  const v1 = (lookup: Partial<Lookup>, parcelLabel: string | null) => ({
    id: "irrelevant",
    schema: 1,
    lookup: {
      type: "7/12",
      district: "35",
      taluka: "2",
      village: "273500020431150000",
      mode: "number",
      st: "2",
      q: "167",
      parcel: null,
      sankalan: null,
      purpose: null,
      duration: null,
      ...lookup,
    },
    labels: { district: "सांगली", taluka: "वाळवा", village: "बोरगांव", parcel: parcelLabel },
    addedAt: "2026-01-01T00:00:00.000Z",
  });

  const from = (...lands: unknown[]) => load({ bhumi_saved_v1: lands });

  it("turns a saved 7/12 request into a parcel", async () => {
    const { collection } = await from(v1({ parcel: "167/2" }, "167/2"));
    const [entry] = collection.all();
    expect(entry).toMatchObject({ kind: "parcel", code: "167/2", schema: 2 });
    expect(entry!.place.villageName).toBe("बोरगांव");
    // The date it was first kept is part of the record, not of the format.
    expect(entry!.addedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("turns a saved 8A request into a holder, keeping the name", async () => {
    const { collection } = await from(
      v1(
        { type: "8A", mode: "name", st: "5", q: "पाखले", parcel: "2379" },
        "प्रकाश विलास पाखले ( 2379 )",
      ),
    );
    expect(collection.all()[0]).toMatchObject({
      kind: "holder",
      code: "2379",
      name: "प्रकाश विलास पाखले",
    });
  });

  it("keeps a Kami-Jasti entry openable rather than dropping it", async () => {
    const { collection, lookupFor } = await from(
      v1({ type: "KJP", q: "12", sankalan: "a", purpose: "b", duration: "c" }, null),
    );
    const [entry] = collection.all();
    expect(entry!.kind).toBe("measurement");
    expect(lookupFor(entry!)).toMatchObject({ type: "KJP", q: "12", sankalan: "a" });
  });

  it("merges the same parcel that v1 had saved twice by different routes", async () => {
    const { collection } = await from(
      v1({ parcel: "167/2" }, "167/2"),
      v1({ mode: "name", st: "5", q: "पाखले", parcel: "167/2" }, "167/2"),
    );
    expect(collection.all()).toHaveLength(1);
  });

  it("drops a request that names no subject", async () => {
    const { collection } = await from(v1({ parcel: null }, null));
    expect(collection.all()).toHaveLength(0);
  });

  it("leaves the v1 key untouched — it is a translation, not a move", async () => {
    await from(v1({ parcel: "167/2" }, "167/2"));
    expect(store.get("bhumi_saved_v1")).toBeDefined();
  });

  it("reads a v1 export file as well as a v1 store", async () => {
    const { collection } = await load();
    const entries = collection.fromFile(
      JSON.stringify({ app: "bhumi", schema: 1, lands: [v1({ parcel: "167/2" }, "167/2")] }),
    );
    expect(entries[0]).toMatchObject({ kind: "parcel", code: "167/2" });
  });
});

describe("snapshot keys", () => {
  const at = (over: Partial<Lookup>): Lookup => ({
    type: "7/12",
    district: "35",
    taluka: "2",
    village: "273500020431150000",
    mode: "number",
    st: "2",
    q: "167",
    parcel: "167/2",
    sankalan: null,
    purpose: null,
    duration: null,
    ...over,
  });

  it("gives one parcel one history however it was found", () => {
    expect(lookupKey(at({}))).toBe(lookupKey(at({ mode: "name", st: "5", q: "पाखले" })));
  });

  it("still separates the two documents of one parcel", () => {
    expect(lookupKey(at({}))).not.toBe(lookupKey(at({ type: "PropertyCard" })));
  });

  it("addresses a KJP record by its measurement, which has no parcel", () => {
    const kjp = at({ type: "KJP", q: "12", parcel: null, sankalan: "a", purpose: "b", duration: "c" });
    expect(lookupKey(kjp)).toContain("12");
    expect(lookupKey(kjp)).not.toBe(lookupKey({ ...kjp, duration: "d" }));
  });
});
