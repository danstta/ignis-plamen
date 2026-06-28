# Plan: Move workflow execution to Inngest Cloud

## Context

Today, when a webhook hits `app/api/hooks/[workflowId]/[nodeId]/route.ts` and the workflow is
active, the handler calls `await startRun(...)` and runs the **entire** automation
synchronously, in-process, inside that one Vercel function invocation (`lib/workflows/engine.ts`).
The webhook sender's HTTP request stays open for the whole run.

The real automations are heavy and chained: `find-location-images` (~5–10s, Google Places +
Blob), `rank-images` (~2–5s, OpenAI vision), `render-template` (~1–3s, Satori + Blob). Together
they routinely approach or exceed serverless/webhook timeouts. This produces two reliability
failures that directly violate the "predictable under load and during failures" mandate in
`AGENTS.md`:

1. **Timeout** — a long run gets the function killed mid-execution (runs left partway, no
   automatic continuation).
2. **Duplicate runs** — slow responses make webhook senders time out and **retry**, starting a
   second run (the ingest has no idempotency).

**Goal:** ack the webhook fast (202) and execute the workflow in **Inngest Cloud** as a durable,
retryable background job, with per-node steps. Inngest Cloud's free tier covers personal volume;
locally we use the Inngest dev server.

The run model is already durable enough to support this: all run state lives in one
`workflow_runs` row (`lib/workflows/runs-service.ts`, `lib/db/schema.ts`), the engine persists
after every node and **skips `done` nodes**, and the DB client is serverless-safe
(`lib/db/index.ts`, `prepare:false`, pooled). The work is decoupling execution from the request —
not rebuilding state.

## Decisions locked

- **Inngest is the only execution path** (no synchronous fallback). The webhook always enqueues.
  Local dev requires the Inngest dev server running.
- **Add live polling** to the run-detail page now, since execution becomes async.

## Key design: one seam, one engine

Do **not** fork the engine. Introduce a single injected abstraction — a `StepRunner` — threaded
through `execute`/`startRun`/`resumeRun`:

```ts
export type StepRunner = <T>(stepId: string, fn: () => Promise<T>) => Promise<T>;
const inlineRunner: StepRunner = (_id, fn) => fn();           // engine's default; keeps engine queue-agnostic + testable
// Inngest adapter (in lib/inngest/functions.ts): (id, fn) => step.run(id, fn) as Promise<T>
```

The topo-walk, input resolution, skip-`done` logic, and state threading are **unchanged** — they
are deterministic loop control that runs on every Inngest replay and stays **outside** steps.
Everything side-effectful (node `run`, `saveRunState`, `createRun`, blob/DB writes,
`crypto.randomUUID`) moves **inside** `step(...)` so Inngest memoizes it and never re-executes it
on replay. `lib/workflows/runs-service.ts`, `lib/workflows/graph.ts`, `lib/db/*`, and every
`lib/nodes/*` are untouched.

**Pause/resume** mirrors today's two-phase model as **two Inngest functions**: `workflow/run.start`
(runs the engine until pause/end) and `workflow/run.resume` (runs resume). Routes send events;
they no longer `await` the engine. (`step.waitForEvent` single-function pause is a possible future
simplification — not v1.)

---

## New files (4)

### 1. `lib/inngest/client.ts`
The typed Inngest client. `eventKey` read via the non-throwing `inngestEventKey()` (module-load
safe; undefined in dev is fine).

```ts
import { Inngest, EventSchemas } from "inngest";
import { inngestEventKey } from "@/lib/env";

type Events = {
  "workflow/run.start": { data: { workflowId: string; triggerNodeId?: string; payload: Record<string, unknown> } };
  "workflow/run.resume": { data: { runId: string; resumeToken: string; choiceUrl: string } };
};

export const inngest = new Inngest({
  id: "design-automations",
  schemas: new EventSchemas().fromRecord<Events>(),
  eventKey: inngestEventKey(),
});
```

### 2. `lib/inngest/functions.ts`
The two functions; inject the Inngest `StepRunner` into the engine. `retries: 4` (only the failed
step retries; prior steps stay memoized), `concurrency: { limit: 10 }` to protect OpenAI/Places
rate limits + the DB pool.

```ts
const runner: StepRunner = <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>;
// runStart  -> startRun(data.workflowId, data.payload, data.triggerNodeId, runner)
// runResume -> resumeRun(data.runId, data.resumeToken, data.choiceUrl, runner)
export const functions = [runStart, runResume];
```

### 3. `app/api/inngest/route.ts`
The serve handler. **Node runtime** (default — postgres.js needs Node; never set edge). One
invocation only runs a single step, so duration needs are modest.

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY, // optional in dev
});
export const maxDuration = 60; // each invocation = one step (worst node ~10s); raise to 300 on Pro/Fluid if ever needed
```

### 4. `app/api/workflows/runs/[runId]/status/route.ts`
Lightweight, auth-gated status endpoint for polling. Returns only what the poller needs to decide
"did something change?" — avoids re-fetching the full RSC payload every tick.

```ts
// GET -> { status, updatedAt, waitingNodeId, error } from getRun(runId)
```

---

## Changed files (6)

### 5. `lib/workflows/engine.ts` — thread the `StepRunner`
- Add `export type StepRunner` + `inlineRunner` default.
- `execute(runId, graph, step = inlineRunner)`:
  - Memoize the initial read: `await step("execute:load-run", () => getRun(runId))` (so replays
    reconstruct progress from memoized step results, not a now-advanced DB row).
  - `topoOrder`, `resolveInputs`, skip-`done` stay **outside** steps (pure/deterministic).
  - Each node iteration becomes two steps: `node:<id>:run` (resolve refs, validate config, run the
    node — returns a JSON-serializable outcome `output | pause | error`) and `node:<id>:persist`
    (the `saveRunState` write). Splitting them means the common transient failure (the DB write)
    retries **only** the cheap persist; the expensive blob/OpenAI work stays memoized and is not
    re-run.
  - `crypto.randomUUID()` for the resume token is generated **inside** the pause persist step.
  - **Drop** the standalone per-node "mark running" `saveRunState` (current lines ~90–91). It's
    cosmetic and unobserved (no live per-node coloring required); polling watches run-level status.
- `startRun(workflowId, trigger, triggerNodeId?, step = inlineRunner)`: wrap `getWorkflow`,
  `createRun` (memoize → stable `runId` on replay), and the trigger-seed write in steps, then
  `execute(run.id, graph, step)`.
- `resumeRun(runId, resumeToken, choiceUrl, step = inlineRunner)`: wrap the loads + the apply-choice
  write in steps, then `execute(...)`. Re-read uses a distinct id (`resume:load-run` vs
  `execute:load-run`).
- Engine does **not** import `inngest` — it stays queue-agnostic; the adapter is supplied by callers.

### 6. `app/api/hooks/[workflowId]/[nodeId]/route.ts` — enqueue instead of run
Everything through `recordWebhookEvent(...)` is unchanged. The `if (workflow.active)` branch:

```ts
const deliveryId = headers["x-idempotency-key"] ?? headers["x-github-delivery"] ?? headers["x-request-id"];
await inngest.send({
  ...(deliveryId ? { id: `${workflowId}:${nodeId}:${deliveryId}` } : {}), // dedupe only when a stable id exists
  name: "workflow/run.start",
  data: { workflowId, triggerNodeId: nodeId, payload },
});
return NextResponse.json({ ok: true, queued: true }, { status: 202 });
```
- Returns 202 `{ queued: true }` (no synchronous `runId`; the run row is created inside the
  function). External callers (Notion) don't consume `run`.
- If `inngest.send` throws, let it 500 so the sender retries — sample capture already happened, so
  no data loss. Remove the now-unused `startRun` import.

### 7. `app/api/workflows/runs/[runId]/resume/route.ts` — enqueue resume
Keep the `{ resumeToken, url }` 400 validation. Pre-validate against `getRun` (preserves the UI's
immediate 400 for a bad/expired token), then `inngest.send({ name: "workflow/run.resume", data })`
and return 202. The engine still re-validates the token inside `run.resume`.

### 8. `lib/env.ts` — Inngest accessors (non-throwing, like `blobToken`)
```ts
export const inngestEventKey = () => process.env.INNGEST_EVENT_KEY;
export const inngestSigningKey = () => process.env.INNGEST_SIGNING_KEY;
```

### 9. `proxy.ts` — exclude the serve endpoint from the auth gate (**required**)
Inngest Cloud / the dev server POST/PUT to `/api/inngest` with no session cookie; the endpoint
verifies its own signing key. Without this, registration/sync silently 307s to `/login`.
```ts
matcher: ["/((?!api/auth|api/hooks|api/inngest|login|_next|.*\\..*).*)"],
```

### 10. Run-detail page + new client poller — live progress
- New client component `app/(admin)/workflows/[id]/runs/[runId]/run-live.tsx`: takes `runId` +
  initial `status`/`updatedAt`; polls `GET /api/workflows/runs/[runId]/status` (~2s while
  `running`, ~5s while `waiting`); on a changed `updatedAt` calls `router.refresh()` to re-render
  the server page with fresh `getRun` data; stops polling on terminal status (`success`/`error`).
  `waiting` stays polled so an async resume surfaces automatically.
- Render `<RunLive .../>` from `app/(admin)/workflows/[id]/runs/[runId]/page.tsx` (server component
  unchanged otherwise; still `force-dynamic`). The existing `ManualReviewPicker` keeps its
  POST-then-`router.refresh()`; the poller covers the post-resume async gap.

---

## Config / setup

- `package.json`: add `inngest` (`bun add inngest`). v3 supports Next 16 App Router via `inngest/next`.
- `.env.example`: add a `# --- Background queue (Inngest) ---` block documenting
  `INNGEST_EVENT_KEY=` and `INNGEST_SIGNING_KEY=` (both blank locally).
- **Inngest account/app**: create the app (`id: design-automations`); copy the Event Key + Signing
  Key per environment (Production / Branch).
- **Vercel**: prefer the official **Inngest–Vercel integration** — it injects both keys and
  auto-syncs functions on each deploy (PUTs `/api/inngest`). Otherwise set the two env vars for
  Production + Preview and click "Sync" with `https://<app>/api/inngest`. Enable **Fluid Compute**.

---

## Verification (end-to-end, local)

1. `bun add inngest` (no env keys needed for dev).
2. Terminal A: `bun run dev`. Terminal B: `bunx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
   (dashboard at `http://localhost:8288`, auto-discovers + syncs `runStart`/`runResume`).
3. Mark a workflow **active**, copy its webhook URL:
   `curl -i -X POST http://localhost:3000/api/hooks/<wf>/<node> -H 'content-type: application/json' -d '{"name":"Test"}'`
   → expect an **immediate 202 `{ "queued": true }`**.
4. Inngest dashboard: see `workflow/run.start` → one function run → steps in sequence
   (`start:create-run`, `node:<id>:run`, `node:<id>:persist`, …, `execute:finish`) with timings.
5. App: open `/workflows/<id>/runs/<runId>` and watch it advance `running → success` **without
   manual refresh** (polling).
6. **Pause/resume**: a manual-review workflow stops at `waiting`; the picker sends
   `workflow/run.resume` → a second function run continues to `success`, and the page updates via
   polling.
7. **Retry proof**: break a key (e.g. bad `OPENAI_API_KEY`) → the `node:<id>:run` step shows 4
   backoff retries while earlier steps stay memoized; run ends `error`. Confirm a `:persist`-only
   retry does **not** re-upload the `find-location-images` blob (single blob URL).
8. **Dedupe**: POST the same webhook twice with an identical `x-idempotency-key` → exactly one
   function run.

---

## Risks & mitigations

- **Replay/side-effect correctness** — every side effect is inside `step.run`; initial
  `getRun`/`createRun` and the `resumeToken` UUID are memoized in steps; pure logic re-runs safely.
- **Non-idempotent nodes on retry** (`find-location-images`/`render-template` make new blobs) —
  split `:run`/`:persist` so the cheap DB write retries alone. Residual: a failure *within* a node
  after a partial side effect re-runs that node → possible orphan blob. Accept for now; keep nodes
  single-side-effect; consider deterministic blob keys later.
- **Step output serialization** — node outputs are already JSON (jsonb). The only non-JSON in a
  step return is `getRun`'s `Date` fields, which the engine never reads (cast `Jsonify<T>` → `T`).
- **Idempotency footgun** — dedupe via event `id` set only when a stable delivery header exists,
  not a function-level `idempotency` expression (which would collapse header-less events to one key).
- **Async UX** — covered by the new polling; resume route pre-validates to keep the immediate 400.

## Minimal file set
**New:** `lib/inngest/client.ts`, `lib/inngest/functions.ts`, `app/api/inngest/route.ts`,
`app/api/workflows/runs/[runId]/status/route.ts`, `app/(admin)/workflows/[id]/runs/[runId]/run-live.tsx`.
**Changed:** `lib/workflows/engine.ts`, `app/api/hooks/[workflowId]/[nodeId]/route.ts`,
`app/api/workflows/runs/[runId]/resume/route.ts`, `lib/env.ts`, `proxy.ts`,
`app/(admin)/workflows/[id]/runs/[runId]/page.tsx`.
**Config:** `package.json` (+`inngest`), `.env.example`.
**Unchanged (single-engine mandate):** `lib/workflows/runs-service.ts`, `lib/workflows/graph.ts`,
`lib/db/*`, all `lib/nodes/*`.
