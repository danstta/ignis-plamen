import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";

/** Rows kept per (workflowId, nodeId) — sample capture only needs the newest. */
const RETAINED_EVENTS_PER_NODE = 20;

/** Buffer the latest inbound payload for a Webhook node, for sample capture. */
export async function recordWebhookEvent(
  workflowId: string,
  nodeId: string,
  payload: Record<string, unknown>,
) {
  await db().insert(webhookEvents).values({ workflowId, nodeId, payload });

  // Retention: these rows exist only to serve "capture sample event", but the
  // route is public — without pruning, every unauthenticated hit grows the
  // table forever. Best-effort, like sample capture itself in the routes.
  try {
    const scope = and(
      eq(webhookEvents.workflowId, workflowId),
      eq(webhookEvents.nodeId, nodeId),
    );
    const newest = db()
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(scope)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(RETAINED_EVENTS_PER_NODE);
    await db()
      .delete(webhookEvents)
      .where(and(scope, notInArray(webhookEvents.id, newest)));
  } catch (err) {
    console.warn(
      `[webhook-events ${workflowId}/${nodeId}] retention prune failed:`,
      err,
    );
  }
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
