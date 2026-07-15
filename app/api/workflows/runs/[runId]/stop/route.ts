import { NextResponse } from "next/server";
import { getRun, stopRun } from "@/lib/workflows/runs-service";

/**
 * Stops a live run cooperatively. Waiting runs stop immediately; running runs are
 * marked stopped now and the engine observes that status before it advances to
 * another node.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "running" && run.status !== "waiting") {
    return NextResponse.json(
      { error: `Run is already ${run.status}` },
      { status: 409 },
    );
  }

  const stopped = await stopRun(runId);
  if (!stopped) {
    return NextResponse.json(
      { error: "Run could not be stopped because it is no longer active" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: stopped.status,
    updatedAt: stopped.updatedAt,
  });
}
