/** Reading the portal's search result rows. Pure, so it is safe in a browser. */

/** A search result row's label, taken apart. */
export interface ParcelLabel {
  /** The holder's name, when the row came from a name search. */
  name: string | null;
  /** The number in parentheses: the survey number (7/12, PC) or khata (8A). */
  number: string | null;
  /** The number in square brackets, when present: the 7/12 khata number. */
  account: string | null;
}

/**
 * Split a name-search row such as `काशिनाथ तुकाराम गडदे ( 1 ) [ 23 ]` into
 * name, number and account. Number-search rows are bare numbers and come back
 * as `{ name: null, number: <label>, account: null }`.
 */
export function parseParcelLabel(label: string): ParcelLabel {
  const text = label.replace(/\s+/g, " ").trim();
  const m = text.match(/^(.*?)\s*\(\s*([^()]*?)\s*\)\s*(?:\[\s*([^\]]*?)\s*\])?$/);
  if (!m) return { name: null, number: text || null, account: null };
  return { name: m[1] || null, number: m[2] || null, account: m[3] || null };
}
