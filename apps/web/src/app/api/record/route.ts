import type { NextRequest } from "next/server";
import { MahabhulekhError, normalizeDigits, type SearchMode, type FetchRecordInput } from "@bhumi/core";
import { withHandler } from "@/lib/api";
import { withSession, searchSignature, type Locator } from "@/lib/store";

// Up to three submits on top of a cascade walk, against a portal that takes
// seconds per postback.
export const maxDuration = 60;

/**
 * A record request carries the search that produced its parcel, not just the
 * parcel. The portal only fills its parcel dropdown as a side effect of
 * searching, so a fetch against a session that has not run that search — a
 * rebuilt session, a shared link opened cold, a second fetch after the last one
 * reset the dropdown — would otherwise fail with an empty dropdown. Carrying
 * the search makes the request self-sufficient instead of dependent on
 * whatever a previous call happened to leave behind.
 */
export async function POST(req: NextRequest) {
  return withHandler(async () => {
    const body = (await req.json()) as Omit<Locator, "mode"> & {
      mode: SearchMode;
      searchType?: string;
      query?: string;
    } & FetchRecordInput;

    const mode = body.mode ?? "number";
    const loc: Locator = {
      recordType: body.recordType,
      district: body.district,
      taluka: body.taluka,
      village: body.village,
      mode,
    };
    const document = await withSession(loc, async (session) => {
      // KJP addresses its record by measurement number and has no parcel dropdown.
      if (body.recordType !== "KJP" && body.searchType) {
        const query = body.query ?? "";
        const signature = searchSignature(mode, body.searchType, query);
        if (session.searched !== signature) {
          session.parcels = await session.client.searchParcels(body.searchType, query);
          session.searched = signature;
        }
        body.parcel = resolveParcel(session.parcels, body.parcel);
      }
      try {
        return await session.client.fetchRecord(body);
      } finally {
        session.searched = null;
      }
    });
    return { document };
  });
}

/**
 * The dropdown row the request means.
 *
 * Usually the value arrives verbatim from a search this app ran, and matches
 * outright. It does not have to: a link from an 8A's holdings addresses a
 * parcel by the number the 8A *printed*, which can differ from the dropdown's
 * own spelling in digits or spacing (`१०७`, `45/1 अ`). Reconciling that here —
 * where the real rows are in hand — is what lets a holding become a link
 * without a verification search per number.
 *
 * A number with no row is an error worth naming, because posting a value the
 * select does not hold returns the portal's own blank page instead.
 */
function resolveParcel(parcels: { value: string; label: string }[], wanted?: string): string {
  if (!wanted) return "";
  if (parcels.some((p) => p.value === wanted)) return wanted;
  const flat = (s: string) => normalizeDigits(s).replace(/\s+/g, "");
  const target = flat(wanted);
  const match = parcels.find((p) => flat(p.value) === target || flat(p.label) === target);
  if (match) return match.value;
  throw new MahabhulekhError(`This village's records do not list ${wanted}.`);
}
