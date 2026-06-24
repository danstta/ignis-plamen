import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns } from "@/lib/db/schema";
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
