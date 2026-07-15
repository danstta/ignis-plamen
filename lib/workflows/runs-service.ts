import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRunLogs, workflowRuns, workflows } from "@/lib/db/schema";
import type { WorkflowRun } from "@/lib/db/schema";
import type {
  NodeOutputs,
  NodeRunState,
  RunLogEntry,
  RunLogLevel,
  RunStatus,
} from "./types";

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

/** Insert one log line. Idempotent under replay (see workflowRunLogs). */
export async function appendRunLog(entry: {
  runId: string;
  nodeId: string;
  visit: number;
  seq: number;
  level: RunLogLevel;
  message: string;
}): Promise<void> {
  await db().insert(workflowRunLogs).values(entry).onConflictDoNothing();
}

/** All logs for a run, grouped per node in (visit, seq) order. */
export async function getRunLogs(
  runId: string,
): Promise<Record<string, RunLogEntry[]>> {
  const rows = await db()
    .select()
    .from(workflowRunLogs)
    .where(eq(workflowRunLogs.runId, runId))
    .orderBy(
      asc(workflowRunLogs.nodeId),
      asc(workflowRunLogs.visit),
      asc(workflowRunLogs.seq),
    );
  const grouped: Record<string, RunLogEntry[]> = {};
  for (const row of rows) {
    (grouped[row.nodeId] ??= []).push({
      id: `${row.visit}:${row.seq}`,
      timestamp: row.createdAt.toISOString(),
      level: row.level,
      message: row.message,
    });
  }
  return grouped;
}

export type RunStatePatch = Partial<{
  status: RunStatus;
  nodeOutputs: Record<string, NodeOutputs>;
  nodeStates: Record<string, NodeRunState>;
  waitingNodeId: string | null;
  resumeToken: string | null;
  error: string | null;
}>;

function stoppedNodeStates(
  states: Record<string, NodeRunState>,
): Record<string, NodeRunState> {
  const next: Record<string, NodeRunState> = {};
  for (const [id, state] of Object.entries(states)) {
    next[id] = state === "running" || state === "waiting" ? "stopped" : state;
  }
  return next;
}

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

/**
 * Persist a status-changing patch only when the run is still in one of
 * `fromStatuses`. Returns the updated row, or null when the transition lost
 * (e.g. a concurrent stopRun already landed) — callers must treat null as
 * "the run is no longer mine to advance" and unwind quietly.
 */
export async function transitionRunState(
  id: string,
  fromStatuses: RunStatus[],
  patch: RunStatePatch,
): Promise<WorkflowRun | null> {
  const rows = await db()
    .update(workflowRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(workflowRuns.id, id),
        inArray(workflowRuns.status, fromStatuses),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Reap runs stuck in "running" whose last persist is older than
 * `staleMinutes`. Only "running" — "waiting" runs legitimately pause for days.
 * Every node boundary persists (touching updated_at), so a healthy run never
 * goes this long without a write. Returns the number of runs reaped.
 */
export async function markStaleRunsAsError(staleMinutes = 30): Promise<number> {
  const rows = await db()
    .update(workflowRuns)
    .set({
      status: "error",
      error: "Run stalled and was reaped.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.status, "running"),
        sql`${workflowRuns.updatedAt} < now() - make_interval(mins => ${staleMinutes})`,
      ),
    )
    .returning({ id: workflowRuns.id });
  return rows.length;
}

export async function stopRun(id: string): Promise<WorkflowRun | null> {
  const rows = await db()
    .update(workflowRuns)
    .set({
      status: "stopped",
      waitingNodeId: null,
      resumeToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, id),
        inArray(workflowRuns.status, ["running", "waiting"]),
      ),
    )
    .returning();
  const stopped = rows[0];
  if (!stopped) return null;

  const nodeStates = stoppedNodeStates(stopped.nodeStates);
  const stateRows = await db()
    .update(workflowRuns)
    .set({ nodeStates, updatedAt: new Date() })
    .where(eq(workflowRuns.id, id))
    .returning();
  return stateRows[0] ?? stopped;
}
