import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";

/** Buffer the latest inbound payload for a Webhook node, for sample capture. */
export async function recordWebhookEvent(
  workflowId: string,
  nodeId: string,
  payload: Record<string, unknown>,
) {
  await db().insert(webhookEvents).values({ workflowId, nodeId, payload });
}

/** Most recent payload received by a Webhook node, or null. */
export async function getLatestWebhookEvent(workflowId: string, nodeId: string) {
  const rows = await db()
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.workflowId, workflowId),
        eq(webhookEvents.nodeId, nodeId),
      ),
    )
    .orderBy(desc(webhookEvents.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
