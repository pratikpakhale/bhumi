import { describe, expect, it } from "vitest";
import { parseParcelLabel } from "./client.js";

describe("parseParcelLabel", () => {
  it("splits a 7/12 name-search row into name, survey and khata", () => {
    expect(parseParcelLabel("काशिनाथ तुकाराम गडदे ( 1 )  [ 23 ] ")).toEqual({
      name: "काशिनाथ तुकाराम गडदे",
      number: "1",
      account: "23",
    });
  });

  it("splits an 8A name-search row into name and khata", () => {
    expect(parseParcelLabel("किसन कोंडीबा ढेंगळे ( 122 )")).toEqual({
      name: "किसन कोंडीबा ढेंगळे",
      number: "122",
      account: null,
    });
  });

  it("treats a bare number as a number-search row", () => {
    expect(parseParcelLabel("12/1अ")).toEqual({ name: null, number: "12/1अ", account: null });
  });
});
