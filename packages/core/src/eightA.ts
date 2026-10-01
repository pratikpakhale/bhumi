/**
 * Structured reading of an 8A (गाव नमुना ८अ) record.
 *
 * 8A is a *holding statement*: one khata holder, one village, and every
 * survey/gat number held under that khata. That makes it the natural index of a
 * family's land — one 8A lookup names every parcel worth pulling a 7/12 for —
 * which is the only reason this parser exists.
 *
 * The portal returns 8A as an HTML table (a {@link RecordDocument} with
 * `format: "html"`), so two layers come back, deliberately separated by how much
 * they can be trusted:
 *
 * - {@link EightAHolding.headers} / {@link EightAHolding.rows} — a faithful,
 *   structure-only transcription. This is just cells; it is either right or the
 *   fragment was not a table.
 * - {@link EightAHolding.surveyNumbers} — a *heuristic* answer to "which column
 *   holds the survey numbers", since the portal documents no schema and the
 *   column order varies with the village's own form. Callers must surface these
 *   for confirmation rather than acting on them silently.
 */

import { decodeEntities } from "./html.js";

/** A parsed 8A table plus the survey numbers read out of it. */
export interface EightAHolding {
  /** The header row's cells, or `[]` when the table has no recognisable header. */
  headers: string[];
  /** Every data row, as raw cell text in document order. */
  rows: string[][];
  /**
   * Survey / gat numbers found in the table — deduped, in document order, and
   * normalised to ASCII digits so they can be fed straight back into a 7/12
   * search. Heuristic: see the module comment.
   */
  surveyNumbers: string[];
  /**
   * How {@link surveyNumbers} was arrived at, so the UI can say how much to
   * trust it. `"header"` means a column header named itself; `"pattern"` means
   * the column was inferred from cell shape; `"none"` means nothing qualified.
   */
  basis: "header" | "pattern" | "none";
}

/** Header text that names the survey/gat column, across the forms seen. */
const SURVEY_HEADER = /भूमापन|भुमापन|सर्व्?हे|स\.?\s*नं|गट|survey|gat|s\.?\s*no/i;

/**
 * Header text that names a column of *quantities* rather than identifiers.
 * Area and assessment cells can look like survey numbers once punctuation is
 * involved (`0-12-34`), so they are excluded before the shape heuristic runs.
 */
const QUANTITY_HEADER = /क्षेत्र|आकार|पोटखराब|आंकारणी|area|assess|hect|आर|एकर/i;

/** A survey/gat number: digits, optionally sub-divided (`45`, `45/1`, `45/1अ`). */
const SURVEY_SHAPE = /^[0-9०-९]+(?:\s*[/\-]\s*[0-9०-९A-Za-zऀ-॥]+)*$/;

/**
 * The base survey number — `167/2` → `167`.
 *
 * The portal's number search matches the भूमापन क्रमांक only: querying `167/2`
 * returns nothing, while `167` returns `167/1`, `167/2` and every other
 * sub-division. So a sub-divided number has to be looked up by its stem and the
 * full number picked out of the results.
 */
export const surveyBase = (surveyNumber: string): string =>
  surveyNumber.split(/[/\-]/)[0]!.trim();

/** Devanagari digits ०-९ map onto 0-9 by codepoint offset. */
export function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/**
 * Parse the HTML of an 8A record.
 *
 * Accepts the whole fragment rather than a single table because the portal nests
 * its report inside layout tables; every `<tr>` in the fragment is collected and
 * the header is found by content, not by position.
 */
export function parseEightA(html: string): EightAHolding {
  const rows = readRows(html);
  if (rows.length === 0) return { headers: [], rows: [], surveyNumbers: [], basis: "none" };

  const headerIndex = rows.findIndex((r) => r.some((c) => SURVEY_HEADER.test(c)));
  const headers = headerIndex >= 0 ? rows[headerIndex]! : [];
  const body = rows.slice(headerIndex + 1);

  const { column, basis } = surveyColumn(headers, body);
  if (column < 0) return { headers, rows: body, surveyNumbers: [], basis: "none" };

  const seen = new Set<string>();
  for (const row of body) {
    const raw = row[column];
    if (!raw || !SURVEY_SHAPE.test(raw)) continue;
    seen.add(normalizeDigits(raw).replace(/\s+/g, ""));
  }
  return { headers, rows: body, surveyNumbers: [...seen], basis };
}

/**
 * Which column holds the survey numbers.
 *
 * A named header wins outright. Failing that, score every column by how many of
 * its cells are shaped like a survey number and take the best — leftmost on a
 * tie, since the identifier column leads these forms. A column must convince a
 * majority of the rows before it is believed at all.
 */
function surveyColumn(
  headers: string[],
  body: string[][],
): { column: number; basis: "header" | "pattern" | "none" } {
  const named = headers.findIndex((h) => SURVEY_HEADER.test(h) && !QUANTITY_HEADER.test(h));
  if (named >= 0) return { column: named, basis: "header" };

  const width = Math.max(0, ...body.map((r) => r.length));
  let best = -1;
  let bestHits = 0;
  for (let c = 0; c < width; c++) {
    if (QUANTITY_HEADER.test(headers[c] ?? "")) continue;
    const hits = body.filter((r) => SURVEY_SHAPE.test(r[c] ?? "")).length;
    if (hits > bestHits) {
      best = c;
      bestHits = hits;
    }
  }
  return bestHits > body.length / 2 ? { column: best, basis: "pattern" } : { column: -1, basis: "none" };
}

/** Every `<tr>` in the fragment, as trimmed plain-text cells. */
function readRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((tr) =>
      [...(tr[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => text(cell[1])),
    )
    .filter((cells) => cells.some((c) => c !== ""));
}

/** Cell markup to readable text: drop tags, decode entities, collapse space. */
function text(fragment: string | undefined): string {
  return decodeEntities((fragment ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
