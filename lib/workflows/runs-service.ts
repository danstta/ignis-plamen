import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns, workflows } from "@/lib/db/schema";
import type { WorkflowRun } from "@/lib/db/schema";
import type { NodeOutputs, NodeRunState, RunStatus } from "./types";

export async function createRun(
  workflowId: string,
  trigger: Record<string, unknown>,
) {
  const rows = await db()
    .insert(workflowRuns)
    .values({ workflowId, trigger, status: "running" })
    .returning();
  return rows[0];
}

export async function getRun(id: string) {
  const rows = await db()
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRuns(workflowId?: string) {
  const base = db()
    .select({
      id: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      status: workflowRuns.status,
      error: workflowRuns.error,
      createdAt: workflowRuns.createdAt,
      updatedAt: workflowRuns.updatedAt,
    })
    .from(workflowRuns)
    .orderBy(desc(workflowRuns.createdAt));
  if (workflowId) {
    return base.where(eq(workflowRuns.workflowId, workflowId));
  }
  return base;
}

/** A run joined with its parent workflow's name — the shape the global Runs view needs. */
export type RunWithWorkflow = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Runs across every workflow, newest first, each tagged with its workflow name.
 * Powers the global Runs page and the dashboard's "recent runs". Filters are
 * optional and composable: by status, by workflow, and a free-text query that
 * matches the workflow name or the run id.
 */
export async function listRunsWithWorkflow(
  opts: {
    status?: RunStatus;
    workflowId?: string;
    q?: string;
    limit?: number;
  } = {},
): Promise<RunWithWorkflow[]> {
  const conditions: SQL[] = [];
  if (opts.status) conditions.push(eq(workflowRuns.status, opts.status));
  if (opts.workflowId)
    conditions.push(eq(workflowRuns.workflowId, opts.workflowId));
  if (opts.q) {
    const like = `%${opts.q}%`;
    const match = or(
      ilike(workflows.name, like),
      sql`${workflowRuns.id}::text ilike ${like}`,
    );
    if (match) conditions.push(match);
  }

  return db()
    .select({
      id: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      workflowName: workflows.name,
      status: workflowRuns.status,
      error: workflowRuns.error,
      createdAt: workflowRuns.createdAt,
      updatedAt: workflowRuns.updatedAt,
    })
    .from(workflowRuns)
    .innerJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(workflowRuns.createdAt))
    .limit(opts.limit ?? 200);
}

/**
 * Cheap "did anything change?" signal for live-refreshing run lists. A change in
 * either the row count (a new run appeared) or the latest update timestamp (a run
 * advanced) flips the signature the client compares against.
 */
export async function getRunsActivity(): Promise<{
  count: number;
  latest: string | null;
}> {
  const rows = await db()
    .select({
      count: sql<number>`count(*)::int`,
      latest: sql<string | null>`max(${workflowRuns.updatedAt})::text`,
    })
    .from(workflowRuns);
  return { count: rows[0]?.count ?? 0, latest: rows[0]?.latest ?? null };
}

export type RunStatePatch = Partial<{
  status: RunStatus;
  nodeOutputs: Record<string, NodeOutputs>;
  nodeStates: Record<string, NodeRunState>;
  waitingNodeId: string | null;
  resumeToken: string | null;
  error: string | null;
}>;

/** Persist a run's evolving state. Called after each node so pauses are durable. */
export async function saveRunState(
  id: string,
  patch: RunStatePatch,
): Promise<WorkflowRun | null> {
  const rows = await db()
    .update(workflowRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workflowRuns.id, id))
    .returning();
  return rows[0] ?? null;
}
