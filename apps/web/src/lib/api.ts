import { NextResponse } from "next/server";
import { MahabhulekhError } from "@bhumi/core";

/** Wrap a route body with consistent JSON error handling. */
export async function withHandler<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof MahabhulekhError) {
      // 503 marks the portal being unwell (worth retrying); 422 is its answer.
      return NextResponse.json(
        { error: err.message, alerts: err.alerts, retryable: err.retryable },
        { status: err.retryable ? 503 : 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
