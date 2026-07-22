import { inngest, runResumeEvent, runStartEvent } from "./client";
import { resumeRun, startRun, type StepRunner } from "@/lib/workflows/engine";
import {
  markStaleRunsAsError,
  transitionRunState,
} from "@/lib/workflows/runs-service";

/**
 * The background functions. The run functions each inject an Inngest
 * {@link StepRunner} into the shared engine: it forwards every engine step to
 * `step.run`, so Inngest memoizes it and never re-executes it on replay. The
 * cast bridges `step.run`'s serialized return type back to the engine's `T` —
 * the engine only reads JSON-safe fields off step results.
 *
 * Expected node-level failures should be handled by the node itself (for example,
 * Rank Images skips bad inputs and logs why). Function retries are enabled:
 * expensive node work is memoized in steps, run logs are append-only inserts
 * that are idempotent by key, and status writes are guarded transitions — so a
 * replay after a transient failure duplicates nothing.
 *
 * `concurrency` caps parallel runs to protect the OpenAI/location-search rate
 * limits and the DB pool.
 */

/**
 * Runs the workflow engine until it ends or pauses. Triggered by `workflow/run.start`,
 * sent from the webhook ingest.
 */
export const runStart = inngest.createFunction(
  {
    id: "workflow-run-start",
    retries: 3,
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
    retries: 3,
    concurrency: { limit: 5 },
    triggers: [{ event: runResumeEvent }],
    // After retries are exhausted, fail the run so the UI stops polling it.
    onFailure: async ({ event }) => {
      const runId = event.data.event.data.runId;
      if (!runId) return;
      await transitionRunState(runId, ["running", "waiting"], {
        status: "error",
        error: "Background execution failed after retries.",
      });
    },
  },
  async ({ event, step }) => {
    const runner: StepRunner = <T>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as Promise<T>;
    await resumeRun(
      event.data.runId,
      event.data.resumeToken,
      event.data.choiceUrl
        ? {
            choiceUrl: event.data.choiceUrl,
            objectPosition: event.data.objectPosition,
            scale: event.data.scale,
          }
        : event.data.selectedImages
          ? { selectedImages: event.data.selectedImages }
          : { selectedUrls: event.data.selectedUrls ?? [] },
      runner,
    );
  },
);

/**
 * Safety net for runs that still get stranded in "running" (e.g. `runStart`
 * exhausts its retries — it cannot name its run in an onFailure handler because
 * the run row is created inside the function). Marks them failed so the UI
 * stops polling.
 */
export const reapStaleRuns = inngest.createFunction(
  {
    id: "workflow-runs-reaper",
    retries: 1,
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async () => {
    const reaped = await markStaleRunsAsError();
    return { reaped };
  },
);

export const functions = [runStart, runResume, reapStaleRuns];
