import type { NextRequest } from "next/server";
import type { SearchMode } from "@bhumi/core";
import { withHandler } from "@/lib/api";
import { withSession, searchSignature, type Locator } from "@/lib/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withHandler(async () => {
    const body = (await req.json()) as Omit<Locator, "mode"> & {
      mode: SearchMode;
      searchType: string;
      query?: string;
    };
    const query = body.query ?? "";
    const loc: Locator = {
      recordType: body.recordType,
      district: body.district,
      taluka: body.taluka,
      village: body.village,
      mode: body.mode,
    };
    const parcels = await withSession(loc, async (session) => {
      const parcels = await session.client.searchParcels(body.searchType, query);
      // Remember the question and its answer, so a follow-up record fetch on
      // this session knows the parcel dropdown is already populated.
      session.searched = searchSignature(body.mode, body.searchType, query);
      session.parcels = parcels;
      return parcels;
    });
    return { parcels };
  });
}
