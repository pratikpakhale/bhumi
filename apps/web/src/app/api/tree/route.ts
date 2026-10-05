import type { NextRequest } from "next/server";
import { z } from "zod";
import { cacheForADay, locator, withHandler } from "@/lib/api";
import { getDistricts, getTalukas, getVillages, getContext, getNameTypes } from "@/lib/tree";

const query = z.discriminatedUnion("kind", [
  locator.pick({ recordType: true }).extend({ kind: z.literal("districts") }),
  locator.pick({ recordType: true, district: true }).extend({ kind: z.literal("talukas") }),
  locator.omit({ village: true }).extend({ kind: z.literal("villages") }),
  locator.extend({ kind: z.literal("context") }),
  locator.extend({ kind: z.literal("nameTypes") }),
]);

/**
 * Cached reference data for the cascading dropdowns. Everything here is stable,
 * so responses are cacheable and never touch the live search session.
 */
export async function GET(req: NextRequest) {
  return cacheForADay(
    await withHandler(async () => {
      const q = query.parse(Object.fromEntries(req.nextUrl.searchParams));
      switch (q.kind) {
        case "districts":
          return { districts: await getDistricts(q.recordType) };
        case "talukas":
          return { talukas: await getTalukas(q.recordType, q.district) };
        case "villages":
          return { villages: await getVillages(q.recordType, q.district, q.taluka) };
        case "context":
          return { context: await getContext(q.recordType, q.district, q.taluka, q.village) };
        case "nameTypes":
          return { nameTypes: await getNameTypes(q.recordType, q.district, q.taluka, q.village) };
      }
    }),
  );
}
