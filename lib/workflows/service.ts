import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import type { WorkflowGraph } from "./types";

export type WorkflowInput = {
  name: string;
  active: boolean;
  graph: WorkflowGraph;
};

export async function listWorkflows() {
  return db()
    .select({
      id: workflows.id,
      name: workflows.name,
      active: workflows.active,
      updatedAt: workflows.updatedAt,
    })
    .from(workflows)
    .orderBy(desc(workflows.updatedAt));
}

export async function getWorkflow(id: string) {
  const rows = await db()
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createWorkflow(input: WorkflowInput) {
  const rows = await db().insert(workflows).values(input).returning();
  return rows[0];
}

export async function updateWorkflow(id: string, input: WorkflowInput) {
  const rows = await db()
    .update(workflows)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteWorkflow(id: string) {
  await db().delete(workflows).where(eq(workflows.id, id));
}
