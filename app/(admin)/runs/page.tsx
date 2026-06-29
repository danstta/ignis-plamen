import Link from "next/link";
import { Activity } from "lucide-react";

import { isUuid } from "@/lib/utils";
import { listRunsWithWorkflow } from "@/lib/workflows/runs-service";
import { listWorkflows } from "@/lib/workflows/service";
import type { RunStatus } from "@/lib/workflows/types";
import { RunsLiveList } from "@/components/workflow/runs-live-list";
import { RunsFilters } from "./runs-filters";

export const dynamic = "force-dynamic";

const STATUSES: RunStatus[] = ["running", "waiting", "success", "error"];

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; workflow?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as RunStatus)
    ? (sp.status as RunStatus)
    : undefined;
  // Guard the uuid before it reaches a uuid column — a malformed value otherwise
  // throws (22P02) instead of simply matching nothing.
  const workflowId =
    sp.workflow && isUuid(sp.workflow) ? sp.workflow : undefined;
  const q = sp.q?.trim() || undefined;

  let runs: Awaited<ReturnType<typeof listRunsWithWorkflow>> = [];
  let workflows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let dbError: string | null = null;
  try {
    [runs, workflows] = await Promise.all([
      listRunsWithWorkflow({ status, workflowId, q, limit: 200 }),
      listWorkflows(),
    ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const filtered = Boolean(status || workflowId || q);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Activity className="size-5" />
        <h1 className="text-2xl font-semibold">Runs</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every workflow execution, newest first. Updates live as runs progress.
      </p>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <RunsFilters
              workflows={workflows.map((w) => ({ id: w.id, name: w.name }))}
              status={status}
              workflowId={workflowId}
              q={q}
            />
          </div>

          <RunsLiveList
            key={`${status ?? ""}|${workflowId ?? ""}|${q ?? ""}`}
            className="mt-4"
            initialRuns={runs}
            showWorkflowName
            workflowId={workflowId}
            status={status}
            q={q}
            pollLimit={50}
            maxRows={200}
            emptyState={
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                {filtered ? (
                  "No runs match these filters."
                ) : (
                  <>
                    No runs yet. Trigger a workflow from its{" "}
                    <Link href="/workflows" className="underline">
                      connection webhook
                    </Link>
                    .
                  </>
                )}
              </div>
            }
          />
        </>
      )}
    </div>
  );
}
