import { NextResponse } from "next/server";
import { getRun } from "@/lib/workflows/runs-service";
import { inngest, runResumeEvent } from "@/lib/inngest/client";

/**
 * Resume a paused (manual-review) run with the human's chosen image. Auth-gated
 * by the proxy matcher (only /api/auth and /api/hooks are public), and further
 * guarded by the per-run resumeToken.
 *
 * The actual resume runs in Inngest. We pre-validate the token here so a bad or
 * expired token still gets the UI's immediate 400 (the engine re-validates inside
 * `workflow/run.resume`), then enqueue and return 202.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/workflows/runs/[runId]/resume">,
) {
  const { runId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    resumeToken?: string;
    url?: string;
  } | null;

  if (!body?.resumeToken || !body?.url) {
    return NextResponse.json(
      { error: "resumeToken and url are required" },
      { status: 400 },
    );
  }

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 400 });
  }
  if (run.status !== "waiting" || !run.waitingNodeId) {
    return NextResponse.json(
      { error: "Run is not awaiting input" },
      { status: 400 },
    );
  }
  if (!run.resumeToken || run.resumeToken !== body.resumeToken) {
    return NextResponse.json({ error: "Invalid resume token" }, { status: 400 });
  }

  // Dedupe on the single-use token, so a double-click (or a sender retry) enqueues
  // exactly one resume regardless of the async gap before the run leaves `waiting`.
  await inngest.send(
    runResumeEvent.create(
      { runId, resumeToken: body.resumeToken, choiceUrl: body.url },
      { id: `${runId}:resume:${body.resumeToken}` },
    ),
  );
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
