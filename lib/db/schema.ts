import {
  pgTable,
  uuid,
  index,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { TemplateDoc } from "@/lib/editor/types";
import type { BrandColor, BrandFont } from "@/lib/brand/types";
import type {
  WorkflowGraph,
  NodeOutputs,
  NodeRunState,
  RunLogEntry,
} from "@/lib/workflows/types";

/** Brand identities: reusable palettes (+ scaffolded fonts/logo) surfaced in the editor. */
export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** Named brand colors shown as swatches in every editor color picker. */
  colors: jsonb("colors").$type<BrandColor[]>().notNull().default([]),
  /** Brand font families (scaffold; see lib/render/fonts.ts for the Inter lock). */
  fonts: jsonb("fonts").$type<BrandFont[]>().notNull().default([]),
  /** Logo image URL, insertable from the editor's Add menu. */
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Sidebar/list folders. Kind keeps designs and workflows in separate spaces. */
export const folders = pgTable("folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind", { enum: ["design", "workflow"] }).notNull(),
  name: text("name").notNull(),
  iconAssetId: uuid("icon_asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  iconUrl: text("icon_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("folders_kind_name_idx").on(table.kind, table.name),
]);

/** Design templates authored in the editor. */
export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  width: integer("width").notNull().default(1080),
  height: integer("height").notNull().default(1080),
  doc: jsonb("doc").$type<TemplateDoc>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("templates_folder_id_idx").on(table.folderId),
]);

/**
 * A connected account: a configured instance of a connection provider (e.g. a
 * Notion integration token, or a Google Drive OAuth grant). Credentials/tokens
 * live in `config`. Action nodes reference one of these to call external APIs.
 */
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Provider id from the registry, e.g. "notion" or "google-drive". */
  type: text("type").notNull(),
  name: text("name").notNull(),
  /** Per-account credentials: API keys/tokens, or OAuth tokens. Encrypt before storing. */
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** One render produced by a webhook trigger (or manual test). */
export const renderJobs = pgTable("render_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").references(() => templates.id, {
    onDelete: "set null",
  }),
  connectionId: uuid("connection_id").references(() => connections.id, {
    onDelete: "set null",
  }),
  /** Resolved placeholder values used for this render. */
  input: jsonb("input").$type<Record<string, string>>().notNull().default({}),
  outputUrl: text("output_url"),
  status: text("status", { enum: ["pending", "success", "error"] })
    .notNull()
    .default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Stored binary assets: editor uploads, re-hosted connection images, render outputs. */
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind", { enum: ["upload", "source", "render"] }).notNull(),
  /** Display/file name shown in the Assets library. */
  name: text("name").notNull().default(""),
  url: text("url").notNull(),
  /**
   * Object path within the storage backend (e.g. "assets/<uuid>.svg"). Kept so the
   * underlying file can be deleted when the asset row is removed.
   */
  storageKey: text("storage_key"),
  /** MIME type, e.g. "image/svg+xml" or "image/png". */
  contentType: text("content_type"),
  /** File size in bytes. */
  bytes: integer("bytes"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** A visual automation authored on the workflow canvas. */
export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  /** Only active workflows are started when their trigger connection fires. */
  active: boolean("active").notNull().default(false),
  /** Nodes + edges; round-tripped to the @xyflow/react canvas. */
  graph: jsonb("graph")
    .$type<WorkflowGraph>()
    .notNull()
    .default({ nodes: [], edges: [] }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("workflows_folder_id_idx").on(table.folderId),
]);

/** One execution of a workflow. Holds enough state to pause and resume. */
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  /** "waiting" = paused on a Manual Review node for human selection. */
  status: text("status", {
    enum: ["running", "waiting", "success", "error", "stopped"],
  })
    .notNull()
    .default("running"),
  /** Normalized trigger payload (e.g. Notion { recordId, fields }). */
  trigger: jsonb("trigger")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** node id -> resolved outputs, so a resumed run never recomputes a done node. */
  nodeOutputs: jsonb("node_outputs")
    .$type<Record<string, NodeOutputs>>()
    .notNull()
    .default({}),
  /** node id -> lifecycle state, for the run-detail UI. */
  nodeStates: jsonb("node_states")
    .$type<Record<string, NodeRunState>>()
    .notNull()
    .default({}),
  /** node id -> structured log entries emitted while the run executes. */
  nodeLogs: jsonb("node_logs")
    .$type<Record<string, RunLogEntry[]>>()
    .notNull()
    .default({}),
  /** The Manual Review node currently paused, if status is "waiting". */
  waitingNodeId: text("waiting_node_id"),
  /** Random token the resume request must present. */
  resumeToken: text("resume_token"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  // Serves the per-workflow runs list (filter + newest-first sort).
  index("workflow_runs_workflow_id_created_at_idx").on(
    table.workflowId,
    table.createdAt.desc(),
  ),
  // Serves the global runs list/poll.
  index("workflow_runs_created_at_idx").on(table.createdAt.desc()),
  // Serves the status filter and the stale-run reaper.
  index("workflow_runs_status_idx").on(table.status),
]);

/**
 * Append-only run log. Replay-idempotent: the engine derives (visit, seq)
 * deterministically, so a replayed Inngest execution re-inserts the same keys
 * and ON CONFLICT DO NOTHING makes the write a no-op. Never UPDATE this table.
 */
export const workflowRunLogs = pgTable(
  "workflow_run_logs",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    /** Engine visit number for the node (redoPrevious re-runs increment it). */
    visit: integer("visit").notNull().default(1),
    /** Per-(node, visit) monotonically increasing entry number. */
    seq: integer("seq").notNull(),
    level: text("level", { enum: ["info", "warn", "error"] })
      .notNull()
      .default("info"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.nodeId, table.visit, table.seq],
    }),
  ],
);

/** On/off state for a registry plugin. The row id IS the plugin id. */
export const plugins = pgTable("plugins", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Buffer of inbound payloads received by a Webhook trigger node, keyed by
 * (workflowId, nodeId). The editor reads the latest row to "capture a sample
 * event" and expose its fields to downstream nodes.
 */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  /** Normalized request payload: { body, headers, query }. */
  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  // Serves the "latest captured sample event" lookup.
  index("webhook_events_workflow_node_created_at_idx").on(
    table.workflowId,
    table.nodeId,
    table.createdAt.desc(),
  ),
]);

export type BrandRow = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type RenderJob = typeof renderJobs.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowRunLog = typeof workflowRunLogs.$inferSelect;
export type PluginRow = typeof plugins.$inferSelect;
export type NewPluginRow = typeof plugins.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
