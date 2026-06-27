import { NextResponse } from "next/server";
import { getRun } from "@/lib/workflows/runs-service";

/**
 * Lightweight, auth-gated polling endpoint for the run-detail page. Returns only
 * what the poller needs to decide "did something change?" (`updatedAt`) and what
 * to surface — not the full run payload, which the RSC page re-fetches on refresh.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/workflows/runs/[runId]/status">,
) {
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: run.status,
    updatedAt: run.updatedAt,
    waitingNodeId: run.waitingNodeId,
    error: run.error,
  });
}
