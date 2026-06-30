import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates, workflowRuns, workflows } from "@/lib/db/schema";

export type DashboardStats = {
  templateCount: number;
  workflowCount: number;
  activeWorkflowCount: number;
  /** Runs created since local midnight. */
  runsToday: number;
  /** Successful share of runs over the last 7 days, 0–100, or null if none. */
  successRate7d: number | null;
  /** Runs currently running or waiting for review. */
  activeRunCount: number;
};

/**
 * At-a-glance counters for the dashboard. Computed with conditional aggregates
 * (one query per table) run in parallel, so the home page is a single round of
 * cheap COUNTs rather than pulling rows into the app.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const startOfTodayIso = startOfToday.toISOString();
  const since7dIso = since7d.toISOString();

  const [tpl, wf, runs] = await Promise.all([
    db().select({ count: sql<number>`count(*)::int` }).from(templates),
    db()
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${workflows.active})::int`,
      })
      .from(workflows),
    db()
      .select({
        runsToday: sql<number>`count(*) filter (where ${workflowRuns.createdAt} >= ${startOfTodayIso})::int`,
        total7d: sql<number>`count(*) filter (where ${workflowRuns.createdAt} >= ${since7dIso})::int`,
        success7d: sql<number>`count(*) filter (where ${workflowRuns.createdAt} >= ${since7dIso} and ${workflowRuns.status} = 'success')::int`,
        active: sql<number>`count(*) filter (where ${workflowRuns.status} in ('running', 'waiting'))::int`,
      })
      .from(workflowRuns),
  ]);

  const total7d = runs[0]?.total7d ?? 0;
  const success7d = runs[0]?.success7d ?? 0;

  return {
    templateCount: tpl[0]?.count ?? 0,
    workflowCount: wf[0]?.total ?? 0,
    activeWorkflowCount: wf[0]?.active ?? 0,
    runsToday: runs[0]?.runsToday ?? 0,
    successRate7d: total7d > 0 ? Math.round((success7d / total7d) * 100) : null,
    activeRunCount: runs[0]?.active ?? 0,
  };
}
