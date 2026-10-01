import { describe, expect, it } from "vitest";
import { normalizeDigits, parseEightA, surveyBase } from "./eightA.js";

/**
 * The shape below mirrors an 8A report as the portal renders it: the record
 * table nested inside a layout table, a Marathi header row, and area columns
 * whose values are punctuated numbers that must not be mistaken for survey
 * numbers.
 */
const EIGHT_A = `
<div id="showPopUp1">
  <table><tr><td>
    <table class="rpt">
      <tr><td colspan="4">गाव नमुना ८अ &nbsp; खाते क्रमांक : 142</td></tr>
      <tr>
        <th>भूमापन क्रमांक</th><th>उप विभाग</th><th>क्षेत्र</th><th>आकार</th>
      </tr>
      <tr><td>45</td><td>--</td><td>0-12-34</td><td>1.25</td></tr>
      <tr><td>45/1</td><td>अ</td><td>0-04-00</td><td>0.50</td></tr>
      <tr><td>१०७</td><td>--</td><td>1-20-00</td><td>3.10</td></tr>
      <tr><td>45</td><td>--</td><td>0-12-34</td><td>1.25</td></tr>
    </table>
  </td></tr></table>
</div>`;

describe("normalizeDigits", () => {
  it("maps Devanagari digits onto ASCII", () => {
    expect(normalizeDigits("१०७/२अ")).toBe("107/2अ");
  });

  it("leaves ASCII and letters alone", () => {
    expect(normalizeDigits("45/1अ")).toBe("45/1अ");
  });
});

describe("surveyBase", () => {
  it("drops the sub-division, which the portal's search does not accept", () => {
    expect(surveyBase("167/2")).toBe("167");
    expect(surveyBase("100/5 अ/5 ब/6 अ/6 ब/14")).toBe("100");
  });

  it("leaves an undivided number alone", () => {
    expect(surveyBase("167")).toBe("167");
  });
});

describe("parseEightA", () => {
  it("reads the survey numbers out of the named column", () => {
    const holding = parseEightA(EIGHT_A);
    expect(holding.basis).toBe("header");
    expect(holding.surveyNumbers).toEqual(["45", "45/1", "107"]);
  });

  it("transcribes the header and the data rows", () => {
    const holding = parseEightA(EIGHT_A);
    expect(holding.headers).toEqual(["भूमापन क्रमांक", "उप विभाग", "क्षेत्र", "आकार"]);
    expect(holding.rows).toHaveLength(4);
    expect(holding.rows[0]).toEqual(["45", "--", "0-12-34", "1.25"]);
  });

  it("never reads an area column as survey numbers", () => {
    // Area cells (`0-12-34`) are shaped like a sub-divided survey number, so a
    // pure shape heuristic would happily return them.
    expect(parseEightA(EIGHT_A).surveyNumbers).not.toContain("0-12-34");
  });

  it("falls back to cell shape when no header names the column", () => {
    const holding = parseEightA(`
      <table>
        <tr><th>अ.क्र.</th><th>तपशील</th></tr>
        <tr><td>12/1</td><td>काही</td></tr>
        <tr><td>13</td><td>काही</td></tr>
        <tr><td>14</td><td>काही</td></tr>
      </table>`);
    expect(holding.basis).toBe("pattern");
    expect(holding.surveyNumbers).toEqual(["12/1", "13", "14"]);
  });

  it("reports 'none' rather than guessing when no column convinces it", () => {
    const holding = parseEightA(`
      <table>
        <tr><th>नाव</th><th>शेरा</th></tr>
        <tr><td>पाटील</td><td>काही</td></tr>
      </table>`);
    expect(holding.basis).toBe("none");
    expect(holding.surveyNumbers).toEqual([]);
  });

  it("returns empty for a fragment with no table", () => {
    expect(parseEightA("<div>no record</div>")).toEqual({
      headers: [],
      rows: [],
      surveyNumbers: [],
      basis: "none",
    });
  });
});
