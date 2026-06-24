import { NextResponse } from "next/server";
import { resumeRun } from "@/lib/workflows/engine";

/**
 * Resume a paused (manual-review) run with the human's chosen image. Auth-gated
 * by the proxy matcher (only /api/auth and /api/webhooks are public), and further
 * guarded by the per-run resumeToken.
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

  try {
    await resumeRun(runId, body.resumeToken, body.url);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
