/** Minimal HTML scraping helpers tailored to the portal's WebForms markup. */

import type { Option } from "./types.js";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the named entities the portal emits plus any numeric `&#160;` / `&#xA0;`. */
export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

/**
 * Display text from a markup fragment: tags dropped, entities decoded, runs of
 * whitespace (including the non-breaking and zero-width characters the portal
 * pads its labels with) collapsed to one space.
 */
export function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ""))
    .replace(/[​-‍﻿]/g, "")
    .replace(/[\s ]+/g, " ")
    .trim();
}

/** Read the `value` attribute of an element addressed by its `id`. */
export function readField(html: string, id: string): string | null {
  const re = new RegExp(`id="${escapeRe(id)}"[^>]*\\bvalue="([^"]*)"`);
  const m = html.match(re);
  return m?.[1] != null ? decodeEntities(m[1]) : null;
}

/**
 * Extract `<option>`s from a `<select>` addressed by its `name` attribute.
 *
 * Values are returned exactly as the portal wrote them — some carry trailing
 * spaces (KJP village codes, 7/12 name-search rows) and the server's event
 * validation rejects a postback whose value differs by so much as a space.
 * Use {@link realOptions} for the caller-facing, trimmed list.
 */
export function readOptions(html: string, selectName: string): Option[] {
  const block = html.match(
    new RegExp(`<select\\b[^>]*\\bname="${escapeRe(selectName)}"[\\s\\S]*?</select>`),
  );
  if (!block) return [];
  return [...block[0].matchAll(/<option[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map(
    (m) => ({
      value: decodeEntities(m[1] ?? ""),
      label: cleanText(m[2] ?? ""),
    }),
  );
}

/**
 * Rows that are not choices: the `--निवडा--` / `Select Option` prompts every
 * dropdown opens with, and the `नाव तपासुन पहा` ("check the name") row a name
 * search returns in place of an empty list.
 */
const PLACEHOLDER = /^(?:-+.*-+|select(?: option)?|निवडा|नाव ?तपासुन पहा\.?)$/i;

/**
 * Whether a message is the portal's way of saying a search found nothing:
 * "नाव तपासुन पहा" (check the name) or "… उपलब्ध नाही" (not available).
 */
export const isNoMatch = (message: string): boolean => /तपासुन पहा|उपलब्ध नाही/.test(message);

/**
 * A dropdown's real choices, ready for callers: placeholders stripped, values
 * trimmed, duplicates dropped.
 *
 * The portal repeats values: a name search returns one `ddlsurveyno` row per
 * matching entry, so a parcel held under two entries is listed twice. Both
 * rows post the same value and fetch the same record, so the first wins and the
 * rest are dropped — `value` identifies an option.
 *
 * Trimming is safe because the client maps a trimmed value back onto the
 * portal's own spelling before posting it (see {@link rawValue}).
 */
export function realOptions(options: Option[]): Option[] {
  const byValue = new Map<string, Option>();
  for (const o of options) {
    const value = o.value.trim();
    if (!value || PLACEHOLDER.test(o.label) || PLACEHOLDER.test(value)) continue;
    if (!byValue.has(value)) byValue.set(value, { value, label: o.label || value });
  }
  return [...byValue.values()];
}

/**
 * The portal's exact spelling of an option value, given a possibly trimmed
 * one. Falls back to the value as given when the select is not on the page.
 */
export function rawValue(html: string, selectName: string, value: string): string {
  const wanted = value.trim();
  return readOptions(html, selectName).find((o) => o.value.trim() === wanted)?.value ?? value;
}

/** Whether the page renders a form control with this `name`. */
export function hasControl(html: string, name: string): boolean {
  return html.includes(`name="${name}"`);
}

/**
 * The padding the portal's error handler appends to every exception message it
 * turns into an `alert()`.
 */
const ERROR_TAIL = /\s*\.{5,}!?\s*$/;

/**
 * Collect the alert() messages the portal registers as startup scripts.
 * These carry validation errors ("enter a valid mobile number"), server
 * exceptions, and the benign "finished" signal.
 *
 * Only single-quoted calls are startup scripts: the page's own validation
 * functions use double quotes and are always present, so they say nothing
 * about the response. Alerts carrying markup are the record rendered into an
 * exception message (see {@link readEmbeddedRecord}), not a message.
 */
export function readAlerts(html: string): string[] {
  return [...html.matchAll(/alert\('([^'<]{1,400})'\)/g)]
    .map((m) => cleanText((m[1] ?? "").replace(ERROR_TAIL, "")))
    .filter(Boolean);
}

/**
 * Messages of the alerts the portal's catch-all exception handler raised —
 * recognisable by the dotted tail it appends. These describe the portal
 * failing, not the request being wrong.
 */
export function readServerErrors(html: string): string[] {
  return [...html.matchAll(/alert\('([^'<]{1,400}?)\s*\.{5,}!?'\)/g)]
    .map((m) => cleanText(m[1] ?? ""))
    .filter(Boolean);
}

/**
 * The record's HTML when the portal delivered it inside an `alert()`.
 *
 * The 7/12 is rendered as an HTML report and then converted to a JPEG. When the
 * conversion throws, the portal's catch-all handler reports the exception as
 * `alert('<message> ...................!')` — and the message is the report
 * itself. The single quotes inside it make the script a syntax error, so a
 * browser shows nothing, but the complete record is right there in the page.
 */
export function readEmbeddedRecord(html: string): string | null {
  const start = html.indexOf("alert('<");
  if (start < 0) return null;
  const end = html.indexOf("</script>", start);
  const body = html.slice(start + "alert('".length, end < 0 ? undefined : end);
  const fragment = body.replace(/'\)\s*(?:;|\/\/\]\]>)?[\s\S]*$/, "").replace(ERROR_TAIL, "");
  return /<table/i.test(fragment) ? fragment : null;
}

/**
 * Read the base64 `data:image` from the `<img>` whose id contains `idPart`
 * (e.g. `ImgPC`, where 7/12 and Property Card render their document).
 */
export function readImageById(
  html: string,
  idPart: string,
): { mime: string; base64: string } | null {
  const tag = html.match(
    new RegExp(`<img\\b[^>]*\\bid="[^"]*${escapeRe(idPart)}[^"]*"[^>]*>`),
  );
  if (!tag) return null;
  const src = tag[0].match(/\bsrc="data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)"/);
  if (!src || !src[2]) return null;
  const ext = src[1] === "jpg" ? "jpeg" : src[1];
  return { mime: `image/${ext}`, base64: src[2] };
}

/**
 * Extract the inner HTML of the `<div>` whose id contains `idPart`, matching
 * nested `<div>`s so the whole record region is captured. Used for the 8A / KJP
 * table records.
 */
export function readDivById(html: string, idPart: string): string | null {
  const open = new RegExp(`<div\\b[^>]*\\bid="[^"]*${escapeRe(idPart)}[^"]*"[^>]*>`);
  const m = open.exec(html);
  if (!m) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(html))) {
    depth += t[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start);
}

/**
 * Make relative asset URLs absolute against the portal base — `src`/`href`
 * attributes in either quote style, and CSS `url(...)` (the 7/12 report draws
 * its watermark as a background image).
 */
export function absolutizeUrls(fragment: string, baseUrl: string): string {
  const abs = (url: string) => {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  };
  const relative = /^(?!https?:|data:|#|\/\/|mailto:|javascript:)/i;
  return fragment
    .replace(/\b(src|href)=(["'])([^"']*)\2/gi, (m, attr, q, url) =>
      relative.test(url) ? `${attr}=${q}${abs(url)}${q}` : m,
    )
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, url) =>
      relative.test(url) ? `url(${q}${abs(url)}${q})` : m,
    );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
