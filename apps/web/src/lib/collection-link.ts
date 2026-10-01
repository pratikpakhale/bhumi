"use client";

/**
 * A whole collection as one link.
 *
 * This is how the collection crosses devices and reaches family without an
 * account existing anywhere: gzip the exported file, base64url it, put it in a
 * query param, send it over WhatsApp. Twenty lands compress to well under a
 * kilobyte, because the repeated JSON keys are exactly what gzip erases.
 *
 * It carries subjects and names only — never snapshots. The history is megabytes
 * of image data and is personal to the device that gathered it; what travels is
 * the *addresses*, so the recipient fetches their own copies.
 *
 * The payload is byte-identical to the exported `.json` file, so import-from-
 * file and import-from-link share one format and one validator.
 */

import { collection, type Entry } from "./collection";

/** Query param carrying a shared collection. */
export const COLLECTION_PARAM = "c";

/** `1` = gzipped, `0` = plain — so an old link stays readable if support changes. */
const GZIP = "1";
const PLAIN = "0";

/** Encode the device's current collection into a link token. */
export async function encodeCollection(entries?: Entry[]): Promise<string> {
  const json = JSON.stringify(collection.toFile(entries));
  if (typeof CompressionStream === "undefined") return PLAIN + base64url(encodeUtf8(json));
  const gzipped = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  return GZIP + base64url(new Uint8Array(gzipped));
}

/** Decode a link token back into entries, throwing a readable message if it is not one. */
export async function decodeCollection(token: string): Promise<Entry[]> {
  const bytes = unbase64url(token.slice(1));
  let json: string;
  if (token[0] === GZIP) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    json = await new Response(stream).text();
  } else {
    json = new TextDecoder().decode(bytes);
  }
  return collection.fromFile(json);
}

/** The full shareable URL for a collection, against the current origin. */
export async function collectionUrl(entries?: Entry[]): Promise<string> {
  const token = await encodeCollection(entries);
  return `${window.location.origin}/?${COLLECTION_PARAM}=${token}`;
}

const encodeUtf8 = (s: string) => new TextEncoder().encode(s);

function base64url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so a large collection cannot blow the argument limit of `apply`.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unbase64url(token: string): Uint8Array<ArrayBuffer> {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    throw new Error("That link is not a Bhumi collection.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
