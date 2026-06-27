import { NextResponse } from "next/server";
import { getConnectionType } from "@/lib/connections/registry";
import {
  buildAuthorizeUrl,
  redirectUri,
  signState,
} from "@/lib/connections/oauth";

/**
 * Kick off an OAuth connect flow. Optionally `?connectionId=…` to re-authorize an
 * existing account instead of creating a new one. Redirects to the provider's
 * consent screen; the callback finishes the exchange.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/connections/oauth/[provider]/start">,
) {
  const { provider } = await ctx.params;
  const def = getConnectionType(provider);
  if (!def || def.auth.type !== "oauth") {
    return NextResponse.json(
      { error: `No OAuth provider "${provider}"` },
      { status: 400 },
    );
  }

  const connectionId =
    new URL(req.url).searchParams.get("connectionId") ?? undefined;
  const state = await signState({ provider, connectionId });
  const authorizeUrl = buildAuthorizeUrl(
    def.auth,
    provider,
    redirectUri(provider, req),
    state,
  );
  return NextResponse.redirect(authorizeUrl);
}
