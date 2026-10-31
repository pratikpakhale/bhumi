import type { NextRequest } from "next/server";
import { collectionBody, readBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/accounts";
import { readJson, writeJson } from "@/lib/bucket";

const keyOf = (username: string) => `collections/${username}.json`;

/** The account's copy of the collection, and the version it is at. */
export async function GET() {
  return withHandler(async () => {
    const stored = await readJson(keyOf(await requireUser()));
    return { collection: stored?.value ?? null, etag: stored?.etag ?? null };
  });
}

/**
 * Replace the account's copy, only if it is still the version the client
 * merged against. If another device wrote in between, nothing is written and
 * the current copy comes back for the client to merge with and try again.
 */
export async function PUT(req: NextRequest) {
  return withHandler(async () => {
    const key = keyOf(await requireUser());
    const { collection, etag } = await readBody(req, collectionBody);
    const written = await writeJson(key, collection, etag);
    if (written) return { saved: true, etag: written };
    const current = await readJson(key);
    return { saved: false, collection: current?.value ?? null, etag: current?.etag ?? null };
  });
}
