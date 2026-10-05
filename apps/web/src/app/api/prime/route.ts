import type { NextRequest } from "next/server";
import { primeBody, readBody, withHandler } from "@/lib/api";
import { withSession } from "@/lib/store";

export const maxDuration = 60;

/**
 * Warm the live search session for a village in the background, so the first
 * search doesn't pay the portal's full cascade latency. Fire-and-forget.
 */
export async function POST(req: NextRequest) {
  return withHandler(async () => {
    const loc = await readBody(req, primeBody);
    await withSession(loc, async () => {});
    return { primed: true };
  });
}
