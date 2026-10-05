import type { NextRequest } from "next/server";
import { readBody, searchBody, withHandler } from "@/lib/api";
import { withSession, searchSignature } from "@/lib/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withHandler(async () => {
    const { mode, searchType, query, ...place } = await readBody(req, searchBody);
    const parcels = await withSession({ ...place, mode }, async (session) => {
      const parcels = await session.client.searchParcels(searchType, query);
      // Remember the question and its answer, so a follow-up record fetch on
      // this session knows the parcel dropdown is already populated.
      session.searched = searchSignature(mode, searchType, query);
      session.parcels = parcels;
      return parcels;
    });
    return { parcels };
  });
}
