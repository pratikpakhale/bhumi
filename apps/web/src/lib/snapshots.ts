"use client";

/**
 * A dated, content-addressed history of every record this device has fetched.
 *
 * This is the part of the collection that cannot be rebuilt later. Mahabhulekh
 * serves only the *current* 7/12; ownership moves through फेरफार (mutations)
 * and the portal keeps no public history, so "what did this gat number say last
 * March" becomes permanently unanswerable the day it stops being true. Keeping
 * every fetch is the only way to ever have that answer.
 *
 * Two consequences shape the design:
 *
 * - **Content-addressed, not append-per-fetch.** A snapshot is stored only when
 *   its bytes differ from the last one. Re-opening an unchanged 7/12 ten times
 *   extends one row's `lastSeenAt` instead of writing ten copies, so every row
 *   in the history is a real change and storage tracks reality rather than
 *   traffic.
 * - **Blobs in IndexedDB, not base64 in `localStorage`.** A 7/12 JPEG is a few
 *   hundred KB and base64 inflates it by a third; years of them belong in a
 *   store built for binary.
 *
 * A snapshot is the portal's own "view only — not for legal purpose" render. It
 * is a personal note of what the portal said on a date, and the UI must never
 * present it as more than that.
 */

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { RecordDocument, RecordType } from "@bhumi/core";

/** One distinct version of a record, with the window it was observed in. */
export interface Snapshot {
  /** `${lookupKey}::${firstSeenAt}` — unique per version, not per fetch. */
  id: string;
  /** The {@link import("./search-params").lookupKey} this belongs to. */
  lookupKey: string;
  recordType: RecordType;
  format: "image" | "html";
  mimeType: string;
  blob: Blob;
  /** SHA-256 of the bytes; what makes "unchanged" cheap to decide. */
  hash: string;
  /** When these exact bytes were first seen. */
  firstSeenAt: string;
  /** The most recent fetch that returned these same bytes. */
  lastSeenAt: string;
}

interface BhumiDB extends DBSchema {
  snapshots: {
    key: string;
    value: Snapshot;
    indexes: { "by-lookup": string };
  };
}

let dbPromise: Promise<IDBPDatabase<BhumiDB>> | null = null;

function db(): Promise<IDBPDatabase<BhumiDB>> {
  dbPromise ??= openDB<BhumiDB>("bhumi", 2, {
    async upgrade(database, from, _to, tx) {
      if (from < 1) {
        const store = database.createObjectStore("snapshots", { keyPath: "id" });
        store.createIndex("by-lookup", "lookupKey");
      }
      if (from === 1) {
        // v1 keyed a snapshot by the whole request, search route included, so
        // one parcel opened by number and by name grew two separate histories.
        // Re-key onto the canonical identity; the two then merge into one.
        const store = tx.objectStore("snapshots");
        for (const row of await store.getAll()) {
          const key = canonicalKey(row.lookupKey);
          if (key === row.lookupKey) continue;
          await store.delete(row.id);
          await store.put({ ...row, lookupKey: key, id: `${key}::${row.firstSeenAt}` });
        }
      }
    },
  });
  return dbPromise;
}

/**
 * A v1 key — the eleven request fields — read down to the five (or, for KJP,
 * eight) that actually name the document. Anything else is already canonical.
 */
function canonicalKey(key: string): string {
  const parts = key.split("|");
  if (parts.length !== 11) return key;
  const at = (i: number) => parts[i] ?? "";
  return at(0) === "KJP"
    ? ["KJP", at(1), at(2), at(3), at(6), at(8), at(9), at(10)].join("|")
    : [at(0), at(1), at(2), at(3), at(7)].join("|");
}

/**
 * Every version held for a lookup, newest first.
 *
 * Two adjacent rows are the two sides of a change: whatever moved in the record
 * happened between the older row's `lastSeenAt` and the newer's `firstSeenAt`.
 */
export async function historyFor(lookupKey: string): Promise<Snapshot[]> {
  const rows = await (await db()).getAllFromIndex("snapshots", "by-lookup", lookupKey);
  return rows.sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
}

/** The most recent version held for a lookup, or null if none. */
export async function latestSnapshot(lookupKey: string): Promise<Snapshot | null> {
  return (await historyFor(lookupKey))[0] ?? null;
}

/** What a fetch turned out to be, relative to what this device already held. */
export type SnapshotStatus = "first" | "unchanged" | "changed";

/**
 * Record a freshly fetched document.
 *
 * The status is the interesting half of the return: for land, "this record has
 * changed since you last looked" is worth saying out loud, and it is a
 * different sentence from "this is the first copy you have".
 */
export async function recordSnapshot(
  lookupKey: string,
  doc: RecordDocument,
): Promise<{ snapshot: Snapshot; status: SnapshotStatus }> {
  const blob = toBlob(doc);
  const hash = await sha256(await blob.arrayBuffer());
  const now = new Date().toISOString();
  const database = await db();

  const previous = await latestSnapshot(lookupKey);
  if (previous?.hash === hash) {
    const touched = { ...previous, lastSeenAt: now };
    await database.put("snapshots", touched);
    return { snapshot: touched, status: "unchanged" };
  }

  const snapshot: Snapshot = {
    id: `${lookupKey}::${now}`,
    lookupKey,
    recordType: doc.recordType,
    format: doc.format,
    mimeType: doc.format === "image" ? doc.mimeType : "text/html",
    blob,
    hash,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  await database.put("snapshots", snapshot);
  return { snapshot, status: previous ? "changed" : "first" };
}

/** Discard a lookup's whole history. Irreversible, so only ever call it on ask. */
export async function forgetHistory(lookupKey: string): Promise<void> {
  const database = await db();
  const keys = await database.getAllKeysFromIndex("snapshots", "by-lookup", lookupKey);
  const tx = database.transaction("snapshots", "readwrite");
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}

/** Total rows and bytes held, for the collection screen's storage line. */
export async function snapshotUsage(): Promise<{ count: number; bytes: number }> {
  const rows = await (await db()).getAll("snapshots");
  return { count: rows.length, bytes: rows.reduce((n, r) => n + r.blob.size, 0) };
}

// ── Conversions ──────────────────────────────────────────────────────────────

function toBlob(doc: RecordDocument): Blob {
  if (doc.format === "html") return new Blob([doc.html], { type: "text/html" });
  const binary = atob(doc.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Pinned to `image/*` so a mislabelled payload can never be replayed from
  // this origin as something scriptable.
  return new Blob([bytes], {
    type: doc.mimeType.startsWith("image/") ? doc.mimeType : "application/octet-stream",
  });
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
