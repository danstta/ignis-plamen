# Plugins

All workflow node types live here, grouped into **plugins** — togglable bundles
that users switch on/off from the Plugins page in the app. The core app (editor,
runs, engine, connections UI) lives in `app/`, `components/`, and `lib/`; it
never hardcodes node behavior. Everything a node needs to appear in the palette,
render on the canvas, expose a config panel, and execute inside a run is driven
by the definitions in this directory.

## Anatomy of a plugin

```
plugins/
  index.ts                 ← register your plugin's manifest here (client-safe)
  server.ts                ← register your plugin's server bundle here
  <plugin-id>/
    plugin.ts              ← manifest: id, name, description, node metas
    server.ts              ← node definitions with run() implementations
    nodes/
      <node-id>/
        meta.ts            ← client-safe metadata + zod config schema
        index.ts           ← the run() implementation (server-only)
        picker.tsx         ← optional: custom UI (e.g. a pause-review screen)
    lib/                   ← optional: helpers only this plugin uses
```

The split matters: **`meta.ts` must stay client-safe**. It is imported by the
browser bundle (palette, canvas, config panel), so it must not import the
database, storage, rendering, or any other server-only module. Server-only code
belongs in the node's `index.ts` (or the plugin's `lib/`), which is only reached
via `plugins/server.ts`.

## Adding a node to an existing plugin

1. Create `plugins/<plugin>/nodes/<node-id>/meta.ts` exporting a
   `NodeMeta` (from `@/lib/nodes/types`):
   - `id` — stable, kebab-case; stored in saved workflows, never change it.
   - `category` — `trigger | source | transform | control | output` (drives
     runtime behavior).
   - `group` — the palette section it appears under.
   - `inputs` / `outputs` — typed ports; the canvas renders one handle per port.
   - `configFields` — declarative fields the generic config panel renders
     (text, select, connection picker, template picker, …).
   - `configSchema` — a zod schema that validates/normalizes stored config.
2. Create `index.ts` exporting a `NodeDefinition`: spread the meta and add
   `run(ctx)`. Return `{ type: "output", outputs }` or
   `{ type: "pause", state }` to wait for human input; throw to fail the run.
   `ctx` gives you validated `config`, resolved `inputs`, the `trigger`
   payload, `log()`, and cooperative-stop helpers. Long-running nodes can set
   `usesDurableSteps: true` and split work via `ctx.step` (memoized Inngest
   steps).
3. List the meta in the plugin's `plugin.ts` and the definition in its
   `server.ts`.

That's it — the palette, insert-step picker, config panel, engine, and plugin
gating all pick the node up from the registries.

## Adding a new plugin

1. Create `plugins/<plugin-id>/` with `plugin.ts` (a `PluginManifest` from
   `@/lib/plugins/types`) and `server.ts` (a `PluginServer`), plus your
   `nodes/` folders.
2. Register the manifest in `plugins/index.ts` and the server bundle in
   `plugins/server.ts` — one import + one array entry each.

Plugins are **off by default** for new installs unless the manifest sets
`defaultEnabled: true`. Enablement is persisted per install in the `plugins`
table and gates both the palette and run execution.

## Shared building blocks

- `@/lib/nodes/types` — the node contract (`NodeMeta`, `NodeDefinition`,
  `NodeRunContext`, port/config field types, `ImageCandidate`).
- `@/lib/nodes/image-input` / `image-preview` / `vision-image-utils` — helpers
  for the shared image-candidate shape.
- `@/lib/connections/*` — OAuth/API-key connections. Use a `connection` config
  field (with `connectionTypes`) and `getConnection()` inside `run()` instead
  of rolling your own credential handling.
- `@/lib/workflows/references` — `valueToText` and friends for `{{...}}`
  token resolution.

Extract logic shared by several nodes into the plugin's `lib/` (or `lib/` at
the repo root if it is genuinely cross-plugin) rather than duplicating it.

## Current limitations (contributions welcome)

- Custom config-panel sections and pause-review UIs (`picker.tsx`) are still
  wired manually in `components/workflow/node-config-panel.tsx` and the run
  detail page — there is no generic UI extension point yet.
- API routes a plugin needs (webhooks, image proxies) must live under `app/api/`
  because of Next.js routing; keep them thin and import the logic from your
  plugin folder (see `app/api/location-images/google-photo/route.ts`).
- Connection providers (`lib/connections/*`) are not yet plugin-scoped.
