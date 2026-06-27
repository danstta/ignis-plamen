import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Inngest serve endpoint. Inngest Cloud / the dev server call here: GET to
 * introspect, PUT to register/sync functions, POST to invoke a step. Runs on the
 * Node runtime (default) — postgres.js needs Node; never set edge. Excluded from
 * the auth proxy (`proxy.ts`): the handler verifies the request signature itself
 * using `INNGEST_SIGNING_KEY` (read from the env automatically; absent in dev).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

// Each invocation runs a single step (worst node ~10s); raise to 300 on Pro/Fluid if ever needed.
export const maxDuration = 60;
