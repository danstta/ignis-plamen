import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/utils";
import { listRunsWithWorkflow } from "@/lib/workflows/runs-service";
import type { RunStatus } from "@/lib/workflows/types";

/**
 * Live-poll feed for run lists (per-workflow, global, dashboard). Returns the most
 * recent runs — optionally scoped by workflow / status / free-text query — newest
 * first, in the slim shape the client list reconciles against.
 *
 * On any failure it answers `{ runs: null }` (still 200) so the poller can tell a
 * transient error ("keep what I have") apart from a genuinely empty list
 * (`{ runs: [] }`) and never wipes the rendered list on a blip.
 */
export const dynamic = "force-dynamic";

const STATUSES: RunStatus[] = [
  "running",
  "waiting",
  "success",
  "error",
  "stopped",
];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const statusParam = sp.get("status");
    const status = STATUSES.includes(statusParam as RunStatus)
      ? (statusParam as RunStatus)
      : undefined;
    // Guard the uuid before it reaches a uuid column — a malformed value otherwise
    // throws (22P02) instead of simply matching nothing.
    const workflowParam = sp.get("workflow");
    const workflowId =
      workflowParam && isUuid(workflowParam) ? workflowParam : undefined;
    const q = sp.get("q")?.trim() || undefined;
    const limitParam = Number(sp.get("limit"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 200)
        : 50;

    const rows = await listRunsWithWorkflow({ status, workflowId, q, limit });
    const runs = rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      workflowName: r.workflowName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json({ runs: null });
  }
}
