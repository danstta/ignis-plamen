import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/session";
import { sessionSecret } from "@/lib/env";

/**
 * Optimistic auth gate (Next 16 renamed Middleware -> Proxy). Sensitive mutations
 * should still re-check the session server-side. Public paths (login, auth + webhook
 * APIs, static files) are excluded via the matcher below.
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const ok = await verifyToken(sessionSecret(), token);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except: auth API, public webhook ingest (api/hooks), the
  // login page, Next internals, and any path with a file extension (static
  // assets, /uploads/*.png, etc.).
  matcher: ["/((?!api/auth|api/hooks|login|_next|.*\\..*).*)"],
};
