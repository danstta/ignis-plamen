import { NextResponse } from "next/server";
import { publicAppUrl } from "@/lib/env";
import { getConnectionType } from "@/lib/connections/registry";
import {
  createConnection,
  getConnection,
  mergeConnectionConfig,
} from "@/lib/connections/service";
import {
  exchangeCodeForToken,
  redirectUri,
  verifyState,
} from "@/lib/connections/oauth";

/**
 * Finish an OAuth connect flow: verify the signed state, exchange the code for
 * tokens, persist them on a new (or reconnected) connection, then bounce back to
 * Settings → Connections.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/connections/oauth/[provider]/callback">,
) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const base = publicAppUrl() ?? `${url.protocol}//${url.host}`;
  const back = (id?: string, err?: string) => {
    const u = new URL(
      id ? `/settings/connections/${id}` : "/settings/connections",
      base,
    );
    if (err) u.searchParams.set("error", err);
    return NextResponse.redirect(u.toString());
  };

  const error = url.searchParams.get("error");
  if (error) return back(undefined, error);

  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (!code || !stateToken) return back(undefined, "missing_code");

  const state = await verifyState(stateToken);
  if (!state || state.provider !== provider) {
    return back(undefined, "invalid_state");
  }

  const def = getConnectionType(provider);
  if (!def || def.auth.type !== "oauth") {
    return back(undefined, "unknown_provider");
  }

  try {
    const tokens = await exchangeCodeForToken(
      def.auth,
      code,
      redirectUri(provider, req),
    );
    let id = state.connectionId;
    if (id && (await getConnection(id))) {
      await mergeConnectionConfig(id, tokens);
    } else {
      const conn = await createConnection({
        type: provider,
        name: def.name,
        config: tokens,
      });
      id = conn.id;
    }
    return back(id);
  } catch (err) {
    return back(undefined, err instanceof Error ? err.message : "exchange_failed");
  }
}
