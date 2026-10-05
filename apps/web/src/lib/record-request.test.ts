import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

type Module = typeof import("./record-request");
let req: Module;

beforeEach(async () => {
  store.clear();
  vi.resetModules();
  req = await import("./record-request");
});

describe("the device's mobile number", () => {
  it("is ten digits starting with 9", () => {
    for (let i = 0; i < 200; i++) expect(req.randomMobile()).toMatch(/^9\d{9}$/);
  });

  it("is made once and then kept", () => {
    expect(req.storedMobile()).toBeNull();
    const first = req.deviceMobile();
    expect(req.deviceMobile()).toBe(first);
    expect(req.storedMobile()).toBe(first);
  });

  it("can be replaced", () => {
    const first = req.deviceMobile();
    const next = req.renewMobile();
    expect(req.deviceMobile()).toBe(next);
    expect(next).toMatch(req.MOBILE);
    expect(next).not.toBe(first);
  });
});
