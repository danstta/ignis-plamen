import { NextResponse } from "next/server";
import { getWorkflow } from "@/lib/workflows/service";
import { recordWebhookEvent } from "@/lib/workflows/webhook-events";
import { inngest, runStartEvent } from "@/lib/inngest/client";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { isUuid } from "@/lib/utils";

/**
 * Public ingest endpoint for a Webhook trigger node. The path identifies the
 * workflow + the node. We buffer the payload (for "Capture sample event" in the
 * editor) and, if the workflow is active, start a run seeded with this payload.
 * Excluded from the auth proxy — anyone with the URL can post to it.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/hooks/[workflowId]/[nodeId]">,
) {
  const { workflowId, nodeId } = await ctx.params;

  const rawBody = await req.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = rawBody; // not JSON — keep the raw string
  }
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const query = Object.fromEntries(new URL(req.url).searchParams.entries());
  const payload = { body, headers, query };

  const bodyKeys =
    body !== null && typeof body === "object"
      ? Object.keys(body as Record<string, unknown>)
      : [];
  console.log(
    `[hook ${workflowId}/${nodeId}] received ${rawBody.length}B — body keys: [${bodyKeys.join(", ")}]`,
  );

  // A malformed id can never name a real workflow. Treat it as "not found"
  // rather than letting Postgres throw (22P02) on the uuid column → a confusing
  // 500. This is also the path hit by a stale URL from an unsaved workflow.
  if (!isUuid(workflowId)) {
    return NextResponse.json(
      { error: "Unknown workflow. Save the workflow, then re-copy its webhook URL." },
      { status: 404 },
    );
  }

  let workflow;
  try {
    workflow = await getWorkflow(workflowId);
  } catch (err) {
    // A genuine database/connection error — the only real 500 left here.
    console.error(`[hook ${workflowId}/${nodeId}] lookup error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
  if (!workflow) {
    return NextResponse.json(
      { error: "Unknown workflow. Save the workflow, then re-copy its webhook URL." },
      { status: 404 },
    );
  }

  const graph = workflow.graph as WorkflowGraph;
  const node = graph.nodes.find((n) => n.id === nodeId && n.type === "webhook");
  if (!node) {
    return NextResponse.json(
      {
        error:
          "No webhook node with that id in this workflow. Save your latest changes, then re-copy the webhook URL.",
      },
      { status: 404 },
    );
  }

  // Sample buffering is best-effort: a failure here must not fail the ingest,
  // otherwise an unrelated DB hiccup would 500 a perfectly valid trigger.
  try {
    await recordWebhookEvent(workflowId, nodeId, payload);
  } catch (err) {
    console.error(`[hook ${workflowId}/${nodeId}] sample capture failed:`, err);
  }

  if (workflow.active) {
    // Enqueue a durable background run and ack fast, instead of running the whole
    // (10s+) automation inline while the sender's request hangs. Dedupe by a stable
    // delivery header when one exists, so a sender's timeout-retry of the same
    // delivery starts exactly one run. We deliberately don't fall back to a random
    // id (that would never dedupe) nor a function-level idempotency expression
    // (that would collapse all header-less events into a single run).
    const deliveryId =
      headers["x-idempotency-key"] ??
      headers["x-github-delivery"] ??
      headers["x-request-id"];
    // Let a send failure propagate to a 500 so the sender retries — the sample was
    // already captured above, so there is no data loss.
    await inngest.send(
      runStartEvent.create(
        { workflowId, triggerNodeId: nodeId, payload },
        deliveryId ? { id: `${workflowId}:${nodeId}:${deliveryId}` } : undefined,
      ),
    );
    console.log(`[hook ${workflowId}/${nodeId}] queued run.start`);
    return NextResponse.json({ ok: true, queued: true }, { status: 202 });
  }

  // Inactive workflow: payload captured for sampling, but no run started.
  console.log(
    `[hook ${workflowId}/${nodeId}] workflow inactive — captured sample, no run`,
  );
  return NextResponse.json({ ok: true, captured: true });
}
