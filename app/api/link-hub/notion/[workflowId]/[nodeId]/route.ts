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
import {
  WEBHOOK_MAX_BODY_BYTES,
  readBodyWithLimit,
  sanitizeWebhookHeaders,
} from "@/lib/workflows/webhook-ingest";
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
  const read = await readBodyWithLimit(req, WEBHOOK_MAX_BODY_BYTES);
  if (!read.ok) {
    return jsonError("Request body too large.", 413);
  }
  const rawBody = read.bytes;

  let body: unknown;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const signal = readNotionWebhookSignal(body);
  if (signal.verificationToken) {
    // Never log the full token — it is the permanent HMAC signing key for this
    // subscription, and Notion delivers it ONLY in this request (the settings
    // UI can resend it here, not display it). The operator must capture it
    // from this delivery through a channel of their choosing.
    console.info(
      `[link-hub/notion ${workflowId}/${nodeId}] Notion verification handshake received (token ends …${signal.verificationToken.slice(-4)}). The full value is deliberately not logged; capture it at subscription time and set NOTION_LINK_HUB_WEBHOOK_VERIFICATION_TOKEN, or use Notion's "Resend token" once a capture channel is in place.`,
    );
    return NextResponse.json({ ok: true, verification: "received" });
  }

  const verificationToken = notionLinkHubWebhookVerificationToken();
  if (!verificationToken) {
    // Fail closed: without the token we cannot authenticate deliveries, and
    // accepting them unsigned would let anyone with the URL start runs.
    return jsonError(
      "Notion webhook is not configured: set NOTION_LINK_HUB_WEBHOOK_VERIFICATION_TOKEN (captured from the subscription's verification request), then retry.",
      503,
    );
  }
  if (
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

  // Persisted/forwarded headers are redacted (x-notion-signature included);
  // signature verification above and dedupe below read req.headers directly.
  const headers = sanitizeWebhookHeaders(req.headers);
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
    req.headers.get("x-notion-delivery") ??
    req.headers.get("x-notion-request-id") ??
    req.headers.get("x-idempotency-key") ??
    req.headers.get("x-request-id") ??
    undefined;

  await inngest.send(
    runStartEvent.create(
      { workflowId, triggerNodeId: nodeId, payload },
      deliveryId ? { id: `${workflowId}:${nodeId}:${deliveryId}` } : undefined,
    ),
  );

  console.info(`[link-hub/notion ${workflowId}/${nodeId}] queued run.start`);
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
