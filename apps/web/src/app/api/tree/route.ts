import type { NextRequest } from "next/server";
import type { RecordType } from "@bhumi/core";
import { withHandler } from "@/lib/api";
import { getDistricts, getTalukas, getVillages, getContext, getNameTypes } from "@/lib/tree";

/**
 * Cached reference data for the cascading dropdowns. Everything here is stable,
 * so responses are heavily cacheable and never touch the live search session.
 */
export async function GET(req: NextRequest) {
  return withHandler(async () => {
    const p = req.nextUrl.searchParams;
    const rt = p.get("recordType") as RecordType;
    const district = p.get("district") ?? "";
    const taluka = p.get("taluka") ?? "";
    const village = p.get("village") ?? "";
    switch (p.get("kind")) {
      case "districts":
        return { districts: await getDistricts(rt) };
      case "talukas":
        return { talukas: await getTalukas(rt, district) };
      case "villages":
        return { villages: await getVillages(rt, district, taluka) };
      case "context":
        return { context: await getContext(rt, district, taluka, village) };
      case "nameTypes":
        return { nameTypes: await getNameTypes(rt, district, taluka, village) };
      default:
        throw new Error("Unknown tree kind");
    }
  });
}
