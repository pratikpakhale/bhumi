import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {} },
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

type Module = typeof import("./recents");
let recents: Module;

beforeEach(async () => {
  store.clear();
  vi.resetModules();
  recents = await import("./recents");
});

const DAY = 864e5;
const read = (scope: string) => recents.ranked(JSON.parse(store.get("bhumi_recents_v1") ?? "{}")[scope]);

describe("scopes", () => {
  it("shares one cascade between 7/12 and 8A, and keeps Property Card apart", () => {
    expect(recents.scope("7/12", "35")).toBe(recents.scope("8A", "35"));
    expect(recents.scope("7/12", "35")).not.toBe(recents.scope("PropertyCard", "35"));
  });
});

describe("ranking", () => {
  it("puts the most used first", () => {
    const now = Date.now();
    recents.remember("s", "a", now);
    recents.remember("s", "b", now);
    recents.remember("s", "b", now);
    expect(read("s")).toEqual(["b", "a"]);
  });

  it("lets a recent pick beat many old ones", () => {
    const now = Date.now();
    for (let i = 0; i < 6; i++) recents.remember("s", "old", now - 365 * DAY);
    recents.remember("s", "new", now);
    expect(read("s")[0]).toBe("new");
  });

  it("keeps a bounded number per scope", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) recents.remember("s", `v${i}`, now + i);
    expect(read("s")).toHaveLength(12);
    expect(read("s")[0]).toBe("v19");
  });

  it("forgets everything on request", () => {
    recents.remember("s", "a");
    recents.remember("t", "b");
    recents.forgetAll();
    expect(read("s")).toEqual([]);
    expect(read("t")).toEqual([]);
  });

  it("survives storage it cannot parse", async () => {
    store.set("bhumi_recents_v1", "not json");
    vi.resetModules();
    const fresh = await import("./recents");
    expect(() => fresh.remember("s", "a")).not.toThrow();
  });
});
