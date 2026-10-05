import { describe, expect, it } from "vitest";
import { BadRequest, readPlace, recordBody, searchBody } from "./api";

const loc = { recordType: "7/12", district: "35", taluka: "2", village: "273500020431150000" };

describe("request schemas", () => {
  it("accepts a search and fills in its defaults", () => {
    expect(searchBody.parse({ ...loc, searchType: "2" })).toMatchObject({ mode: "number", query: "" });
  });

  it("rejects codes that are not codes", () => {
    expect(() => searchBody.parse({ ...loc, district: "35; drop", searchType: "2" })).toThrow();
    expect(() => searchBody.parse({ ...loc, recordType: "9/9", searchType: "2" })).toThrow();
  });

  it("only takes a plausible Indian mobile number", () => {
    const body = { ...loc, language: "mr", parcel: "167/2", searchType: "2" };
    expect(recordBody.safeParse({ ...body, mobile: "9123456789" }).success).toBe(true);
    expect(recordBody.safeParse({ ...body, mobile: "1234567890" }).success).toBe(false);
    expect(recordBody.safeParse({ ...body, mobile: "91234" }).success).toBe(false);
  });

  it("bounds free text", () => {
    expect(() => searchBody.parse({ ...loc, searchType: "2", query: "x".repeat(201) })).toThrow();
  });
});

describe("readPlace", () => {
  it("reads a taluka and an optional village", () => {
    expect(readPlace(new URLSearchParams("district=35&taluka=2"))).toEqual({ district: "35", taluka: "2", village: null });
  });

  it("refuses anything else as a bad request", () => {
    expect(() => readPlace(new URLSearchParams("district=x&taluka=2"))).toThrow(BadRequest);
    expect(() => readPlace(new URLSearchParams("district=35&taluka=2"), true)).toThrow(BadRequest);
  });
});
