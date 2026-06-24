import { NextResponse } from "next/server";
import { getConnectionType } from "@/lib/connections/registry";
import {
  getConnection,
  mergeConnectionConfig,
} from "@/lib/connections/service";
import { processEvent } from "@/lib/connections/pipeline";
import { listActiveWorkflowsForConnection } from "@/lib/workflows/service";
import { startRun } from "@/lib/workflows/engine";

/**
 * Generic ingest endpoint. `connectionId` is a connection *instance* id. We load
 * its config, dispatch to the matching connection type from the registry, and
 * handle verification / events uniformly. This route is public (excluded from the
 * auth proxy) — connections verify their own requests (e.g. Notion signatures).
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/webhooks/[connectionId]">,
) {
  const { connectionId } = await ctx.params;
  const rawBody = await req.text();

  const connection = await getConnection(connectionId);
  if (!connection) {
    return NextResponse.json({ error: "Unknown connection" }, { status: 404 });
  }

  const definition = getConnectionType(connection.type);
  if (!definition) {
    return NextResponse.json(
      { error: `No handler for connection type "${connection.type}"` },
      { status: 400 },
    );
  }

  const config = definition.configSchema.parse(connection.config ?? {});

  let result;
  try {
    result = await definition.handleWebhook(req, config, rawBody);
  } catch (err) {
    console.error(`[webhook ${connectionId}] handler error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (result.type === "verification") {
    // Persist the captured token; it's also the event-signing secret.
    await mergeConnectionConfig(connectionId, {
      verificationToken: result.verificationToken,
    });
    return NextResponse.json({ ok: true, verified: true });
  }

  if (result.type === "ignored") {
    return NextResponse.json({ ok: true, ignored: result.reason ?? true });
  }

  // result.type === "event"
  try {
    // Prefer workflows: if any active workflow is triggered by this connection,
    // start a run for each. Otherwise fall back to the legacy binding pipeline.
    const activeWorkflows = await listActiveWorkflowsForConnection(connectionId);
    if (activeWorkflows.length > 0) {
      const trigger = { recordId: result.recordId, fields: result.fields };
      const runIds: string[] = [];
      for (const wf of activeWorkflows) {
        runIds.push(await startRun(wf.id, trigger));
      }
      return NextResponse.json({ ok: true, runs: runIds });
    }

    const summary = await processEvent(connectionId, result.recordId, result.fields);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error(`[webhook ${connectionId}] pipeline error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
