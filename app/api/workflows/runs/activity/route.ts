import { NextResponse } from "next/server";
import { getRunsActivity } from "@/lib/workflows/runs-service";

/**
 * Lightweight polling endpoint for live-refreshing run lists (dashboard + global
 * Runs page). Returns a small signature the client diffs to decide whether to
 * re-render. On error it still answers 200 with an empty signature so the poller
 * degrades quietly instead of error-looping.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getRunsActivity());
  } catch {
    return NextResponse.json({ count: 0, latest: null });
  }
}
