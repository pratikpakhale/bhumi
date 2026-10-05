"use client";

/**
 * The copy of each record this device last fetched.
 *
 * One per record, overwritten by every fetch. It is what makes a record open
 * instantly on a second visit — and with no signal at all, which is this app's
 * reader's usual situation — while the live fetch runs behind it.
 *
 * An earlier version kept every version whose bytes differed, as a history of
 * the land. It could not work: the portal stamps each render (print time,
 * session details), so every fetch hashed as "changed" and the history filled
 * with identical-looking rows while claiming the record had changed. A claim
 * about land ownership that is false is worse than no claim, so the history
 * was removed; v3 of the database keeps only the newest copy of each record.
 *
 * A copy is the portal's own "view only — not for legal purpose" render, and
 * the UI must never present it as more than a note of what the portal said on
 * a date.
 */

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { RecordDocument, RecordType } from "@bhumi/core";

export interface Copy {
  /** The {@link import("./search-params").lookupKey} it is a copy of. */
  lookupKey: string;
  recordType: RecordType;
  format: "image" | "html";
  mimeType: string;
  blob: Blob;
  /** When it was fetched. */
  savedAt: string;
}

/** The v1/v2 store, read once during the upgrade and then dropped. */
interface LegacySnapshot {
  id: string;
  lookupKey: string;
  recordType: RecordType;
  format: "image" | "html";
  mimeType: string;
  blob: Blob;
  lastSeenAt: string;
}

interface BhumiDB extends DBSchema {
  copies: { key: string; value: Copy };
  snapshots: { key: string; value: LegacySnapshot; indexes: { "by-lookup": string } };
}

let dbPromise: Promise<IDBPDatabase<BhumiDB>> | null = null;

function db(): Promise<IDBPDatabase<BhumiDB>> {
  dbPromise ??= openDB<BhumiDB>("bhumi", 3, {
    async upgrade(database, from, _to, tx) {
      const copies = database.createObjectStore("copies", { keyPath: "lookupKey" });
      if (from < 1) return;
      // Keep the newest version of each record from the old history.
      const newest = new Map<string, LegacySnapshot>();
      for (const row of await tx.objectStore("snapshots").getAll()) {
        const key = canonicalKey(row.lookupKey);
        const was = newest.get(key);
        if (!was || was.lastSeenAt < row.lastSeenAt) newest.set(key, row);
      }
      for (const [lookupKey, row] of newest) {
        await copies.put({
          lookupKey,
          recordType: row.recordType,
          format: row.format,
          mimeType: row.mimeType,
          blob: row.blob,
          savedAt: row.lastSeenAt,
        });
      }
      database.deleteObjectStore("snapshots");
    },
    blocking() {
      // A newer version of the app in another tab is waiting to upgrade: let
      // go rather than leave it stuck. The next call here reopens, or fails
      // into "no copy".
      void dbPromise?.then((open) => open.close());
      dbPromise = null;
    },
  }).catch((e: unknown) => {
    dbPromise = null; // let the next call try again
    throw e;
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

/** The copy held for a record, or null. Never throws: no copy is not an error. */
export async function copyOf(lookupKey: string): Promise<Copy | null> {
  try {
    return (await (await db()).get("copies", lookupKey)) ?? null;
  } catch {
    return null;
  }
}

/** Keep a freshly fetched document as the record's copy. Best effort. */
export async function keepCopy(lookupKey: string, doc: RecordDocument): Promise<void> {
  try {
    const blob = documentBlob(doc);
    await (await db()).put("copies", {
      lookupKey,
      recordType: doc.recordType,
      format: doc.format,
      mimeType: blob.type,
      blob,
      savedAt: new Date().toISOString(),
    });
  } catch {
    // Storage full or unavailable: the record is still on screen.
  }
}

export async function forgetAllCopies(): Promise<void> {
  await (await db()).clear("copies");
}

/** Which records have a copy, and how much room they take. */
export async function copyIndex(): Promise<{ keys: Set<string>; bytes: number }> {
  try {
    const rows = await (await db()).getAll("copies");
    return { keys: new Set(rows.map((r) => r.lookupKey)), bytes: rows.reduce((n, r) => n + r.blob.size, 0) };
  } catch {
    return { keys: new Set(), bytes: 0 };
  }
}

/** A fetched document's bytes, as both the live view and the kept copy hold them. */
export function documentBlob(doc: RecordDocument): Blob {
  if (doc.format === "html") return new Blob([doc.html], { type: "text/html" });
  const binary = atob(doc.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Pinned to `image/*` so a mislabelled payload can never be served from
  // this origin as something scriptable.
  return new Blob([bytes], {
    type: doc.mimeType.startsWith("image/") ? doc.mimeType : "application/octet-stream",
  });
}
