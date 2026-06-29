import Link from "next/link";
import {
  Activity,
  CircleCheck,
  LayoutTemplate,
  Plus,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { getDashboardStats } from "@/lib/dashboard/stats";
import { listRunsWithWorkflow } from "@/lib/workflows/runs-service";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { RunsLiveList } from "@/components/workflow/runs-live-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let recentRuns: Awaited<ReturnType<typeof listRunsWithWorkflow>> = [];
  let dbError: string | null = null;
  try {
    [stats, recentRuns] = await Promise.all([
      getDashboardStats(),
      listRunsWithWorkflow({ limit: 6 }),
    ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design templates, wire up workflows, and watch every run in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/editor/new" />}>
            <Plus className="size-4" /> New template
          </Button>
          <Button render={<Link href="/workflows/new" />}>
            <Plus className="size-4" /> New workflow
          </Button>
        </div>
      </div>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : stats ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Templates"
              value={stats.templateCount}
              hint="designs"
              icon={<LayoutTemplate className="size-4" />}
              href="/templates"
            />
            <StatCard
              label="Workflows"
              value={stats.workflowCount}
              hint={`${stats.activeWorkflowCount} active`}
              icon={<WorkflowIcon className="size-4" />}
              href="/workflows"
            />
            <StatCard
              label="Runs today"
              value={stats.runsToday}
              hint={
                stats.activeRunCount > 0
                  ? `${stats.activeRunCount} in progress`
                  : "across all workflows"
              }
              icon={<Activity className="size-4" />}
              href="/runs"
            />
            <StatCard
              label="Success rate"
              value={
                stats.successRate7d === null ? "—" : `${stats.successRate7d}%`
              }
              hint="last 7 days"
              icon={<CircleCheck className="size-4" />}
              href="/runs"
            />
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Recent runs
              </h2>
              <Link
                href="/runs"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                View all
              </Link>
            </div>

            <RunsLiveList
              className="mt-3"
              initialRuns={recentRuns}
              showWorkflowName
              pollLimit={6}
              maxRows={6}
              emptyState={
                <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                  No runs yet. Activate a workflow to see executions here.
                </div>
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
