import { NextResponse } from "next/server";
import { inngest, runStartEvent } from "@/lib/inngest/client";
import { notionLinkHubWebhookVerificationToken } from "@/lib/env";
import {
  readNotionWebhookSignal,
  verifyNotionWebhookSignature,
} from "@/lib/link-hub/notion";
import { isUuid } from "@/lib/utils";
import { getWorkflow } from "@/lib/workflows/service";
import { recordWebhookEvent } from "@/lib/workflows/webhook-events";
import type { WorkflowGraph } from "@/lib/workflows/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Notion-specific adapter for Link Hub workflows. It handles Notion's optional
 * webhook verification/signature layer, then starts the saved workflow through a
 * normal Webhook node. The Supabase update happens downstream in the
 * link-hub-supabase-sync node.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/link-hub/notion/[workflowId]/[nodeId]">,
) {
  const { workflowId, nodeId } = await ctx.params;
  const rawBody = Buffer.from(await req.arrayBuffer());

  let body: unknown;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const signal = readNotionWebhookSignal(body);
  if (signal.verificationToken) {
    console.info(
      `[link-hub/notion ${workflowId}/${nodeId}] Notion verification_token: ${signal.verificationToken}`,
    );
    return NextResponse.json({ ok: true, verification: "received" });
  }

  const verificationToken = notionLinkHubWebhookVerificationToken();
  if (
    verificationToken &&
    !verifyNotionWebhookSignature(
      rawBody,
      req.headers.get("x-notion-signature"),
      verificationToken,
    )
  ) {
    return jsonError("Invalid Notion signature.", 401);
  }

  if (!isUuid(workflowId)) {
    return jsonError(
      "Unknown workflow. Save the workflow, then re-copy its Notion webhook URL.",
      404,
    );
  }

  let workflow;
  try {
    workflow = await getWorkflow(workflowId);
  } catch (err) {
    console.error(`[link-hub/notion ${workflowId}/${nodeId}] lookup error:`, err);
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
  if (!workflow) {
    return jsonError(
      "Unknown workflow. Save the workflow, then re-copy its Notion webhook URL.",
      404,
    );
  }

  const graph = workflow.graph as WorkflowGraph;
  const node = graph.nodes.find((n) => n.id === nodeId && n.type === "webhook");
  if (!node) {
    return jsonError(
      "No webhook node with that id in this workflow. Save your latest changes, then re-copy its Notion webhook URL.",
      404,
    );
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const query = Object.fromEntries(new URL(req.url).searchParams.entries());
  const payload = {
    body,
    headers,
    query,
    notion: {
      eventType: signal.eventType,
      pageId: signal.pageId,
      dataSourceId: signal.dataSourceId,
    },
  };

  try {
    await recordWebhookEvent(workflowId, nodeId, payload);
  } catch (err) {
    console.error(
      `[link-hub/notion ${workflowId}/${nodeId}] sample capture failed:`,
      err,
    );
  }

  if (!workflow.active) {
    return NextResponse.json({ ok: true, captured: true });
  }

  const deliveryId =
    headers["x-notion-delivery"] ??
    headers["x-notion-request-id"] ??
    headers["x-idempotency-key"] ??
    headers["x-request-id"];

  await inngest.send(
    runStartEvent.create(
      { workflowId, triggerNodeId: nodeId, payload },
      deliveryId ? { id: `${workflowId}:${nodeId}:${deliveryId}` } : undefined,
    ),
  );

  console.info(`[link-hub/notion ${workflowId}/${nodeId}] queued run.start`);
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
