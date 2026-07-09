import { NextResponse } from "next/server";
import {
  linkHubSyncSecret,
  notionLinkHubWebhookVerificationToken,
} from "@/lib/env";
import {
  readNotionWebhookSignal,
  signalMatchesConfiguredDataSource,
  timingSafeEqualText,
  verifyNotionWebhookSignature,
} from "@/lib/link-hub/notion";
import {
  syncLinkHubDataSource,
  syncLinkHubPage,
  type LinkHubSyncResult,
} from "@/lib/link-hub/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function manualSyncAuthorized(req: Request): boolean {
  const expected = linkHubSyncSecret();
  if (!expected) return false;

  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";
  const provided =
    bearer ||
    req.headers.get("x-link-hub-sync-secret")?.trim() ||
    url.searchParams.get("secret")?.trim() ||
    "";

  return Boolean(provided && timingSafeEqualText(provided, expected));
}

async function runSyncForSignal(
  signal: ReturnType<typeof readNotionWebhookSignal>,
) {
  if (!signalMatchesConfiguredDataSource(signal)) {
    return {
      mode: "full",
      upserted: 0,
      hidden: 0,
      skipped: "event_outside_configured_data_source",
    } satisfies LinkHubSyncResult;
  }

  if (!signal.requiresFullSync && signal.pageId) {
    return syncLinkHubPage(signal.pageId);
  }

  return syncLinkHubDataSource();
}

export async function GET(req: Request) {
  if (!manualSyncAuthorized(req)) {
    return jsonError("Not found.", 404);
  }

  try {
    const result = await syncLinkHubDataSource();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[link-hub/notion] manual sync failed:", err);
    return jsonError(errorMessage(err), 500);
  }
}

export async function POST(req: Request) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  let body: unknown;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const signal = readNotionWebhookSignal(body);
  if (signal.verificationToken && !req.headers.get("x-notion-signature")) {
    console.info(
      `[link-hub/notion] Notion verification_token: ${signal.verificationToken}`,
    );
    return NextResponse.json({ ok: true, verification: "received" });
  }

  const verificationToken = notionLinkHubWebhookVerificationToken();
  if (!verificationToken) {
    console.error(
      "[link-hub/notion] Missing NOTION_LINK_HUB_WEBHOOK_VERIFICATION_TOKEN.",
    );
    return jsonError("Webhook is not configured.", 500);
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

  try {
    const result = await runSyncForSignal(signal);
    console.info("[link-hub/notion] synced", {
      eventType: signal.eventType,
      pageId: signal.pageId,
      dataSourceId: signal.dataSourceId,
      result,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[link-hub/notion] sync failed:", err);
    return jsonError(errorMessage(err), 500);
  }
}
