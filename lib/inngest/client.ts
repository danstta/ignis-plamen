import { Inngest, eventType, staticSchema } from "inngest";
import { inngestEventKey } from "@/lib/env";

/** Payload to start a fresh workflow run from a webhook trigger. */
export type RunStartData = {
  workflowId: string;
  triggerNodeId?: string;
  payload: Record<string, unknown>;
};

/** Payload to resume a paused review run with the human's choice. */
export type RunResumeData = {
  runId: string;
  resumeToken: string;
  choiceUrl: string;
};

/**
 * Typed event definitions. Used both as function triggers (`lib/inngest/functions.ts`)
 * and to construct type-checked `inngest.send(...)` payloads via `.create(...)`.
 * `staticSchema` provides compile-time types only — no runtime validation library
 * is pulled in (the payloads are already shaped by the routes that send them).
 */
export const runStartEvent = eventType("workflow/run.start", {
  schema: staticSchema<RunStartData>(),
});
export const runResumeEvent = eventType("workflow/run.resume", {
  schema: staticSchema<RunResumeData>(),
});

/**
 * The Inngest client. `eventKey` is read lazily via the non-throwing accessor so
 * module load never fails when it's absent (the local dev server needs no key).
 */
export const inngest = new Inngest({
  id: "design-automations",
  eventKey: inngestEventKey(),
});
