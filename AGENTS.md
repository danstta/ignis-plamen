<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tooling
This project uses **Bun**, not npm. Use `bun install`, `bun run <script>` (e.g. `bun run dev`, `bun run build`, `bun run lint`), and `bunx <pkg>` instead of `npx`. Don't run `npm`/`npx` or create a `package-lock.json` — Bun manages dependencies via `bun.lock`.

# Project Snapshot
This app is a minimal web GUI for making automations for any usacase, it's Canva and Zapier in one, in the future it should port all other usecases currently we are wokring on making design templates with placeholders with coneections for Google Drive and Notion API.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

# Core Priorities
Performance first.
Reliability first.
Keep behavior predictable under load and during failures (session restarts, reconnects etc.).
If a tradeoff is required, choose correctness and robustness over short-term convenience.

# Repository Layout
- `plugins/` — all workflow node types, grouped into togglable plugins. Each plugin ships a client-safe `plugin.ts` manifest (node metas) and a `server.ts` bundle (run() implementations). **New nodes and integrations go here** — see `plugins/README.md` for the contract.
- `app/`, `components/` — the core product: workflow/design editors, runs, plugins page, connections, auth.
- `lib/` — core services and the plugin SDK: `lib/nodes/types.ts` (node contract), `lib/workflows/` (engine, graph, references), `lib/connections/` (OAuth/API-key providers), `lib/plugins/` (enablement service + registry derived from `plugins/`).
Never import a plugin's `server.ts`/node `index.ts` from client code — client surfaces consume node metadata only, via `lib/nodes/catalog.ts`.

# Maintainability
Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.
