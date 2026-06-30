import { inngest, runResumeEvent, runStartEvent } from "./client";
import { resumeRun, startRun, type StepRunner } from "@/lib/workflows/engine";

/**
 * The two background functions. Each injects an Inngest {@link StepRunner} into the
 * shared engine: it forwards every engine step to `step.run`, so Inngest memoizes
 * it and never re-executes it on replay. The cast bridges `step.run`'s serialized
 * return type back to the engine's `T` — the engine only reads JSON-safe fields off
 * step results.
 *
 * `retries: 4` retries only the failed step (prior steps stay memoized);
 * `concurrency` caps parallel runs to protect the OpenAI/location-search rate limits and the
 * DB pool.
 */

/**
 * Runs the workflow engine until it ends or pauses. Triggered by `workflow/run.start`,
 * sent from the webhook ingest.
 */
export const runStart = inngest.createFunction(
  {
    id: "workflow-run-start",
    retries: 4,
    concurrency: { limit: 5 },
    triggers: [{ event: runStartEvent }],
  },
  async ({ event, step }) => {
    const runner: StepRunner = <T>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as Promise<T>;
    const runId = await startRun(
      event.data.workflowId,
      event.data.payload,
      event.data.triggerNodeId,
      runner,
    );
    return { runId };
  },
);

/** Continues a paused run after a human picks an image. Triggered by `workflow/run.resume`. */
export const runResume = inngest.createFunction(
  {
    id: "workflow-run-resume",
    retries: 4,
    concurrency: { limit: 5 },
    triggers: [{ event: runResumeEvent }],
  },
  async ({ event, step }) => {
    const runner: StepRunner = <T>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as Promise<T>;
    await resumeRun(
      event.data.runId,
      event.data.resumeToken,
      event.data.choiceUrl,
      runner,
    );
  },
);

export const functions = [runStart, runResume];
