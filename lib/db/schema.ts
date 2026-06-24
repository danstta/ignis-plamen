import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import type { TemplateDoc } from "@/lib/editor/types";
import type { BrandColor, BrandFont } from "@/lib/brand/types";
import type {
  WorkflowGraph,
  NodeOutputs,
  NodeRunState,
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

/** Design templates authored in the editor. */
export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  width: integer("width").notNull().default(1080),
  height: integer("height").notNull().default(1080),
  doc: jsonb("doc").$type<TemplateDoc>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Configured instances of a connection type (e.g. a Notion integration). */
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Connection type id from the registry, e.g. "notion". */
  type: text("type").notNull(),
  name: text("name").notNull(),
  /** Per-instance config (tokens/secrets). Encrypt sensitive values before storing. */
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Maps a connection's incoming fields onto a template's placeholder keys. */
export const bindings = pgTable("bindings", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  /** placeholderKey -> connection field name. */
  fieldMap: jsonb("field_map")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  /** placeholderKey -> default value when the field is missing. */
  defaults: jsonb("defaults")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  active: boolean("active").notNull().default(true),
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
  url: text("url").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** A visual automation authored on the workflow canvas. */
export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** Only active workflows are started when their trigger connection fires. */
  active: boolean("active").notNull().default(false),
  /** Nodes + edges; round-tripped to the @xyflow/react canvas. */
  graph: jsonb("graph")
    .$type<WorkflowGraph>()
    .notNull()
    .default({ nodes: [], edges: [] }),
  /** Connection whose webhook starts this workflow; looked up in the webhook route. */
  triggerConnectionId: uuid("trigger_connection_id").references(
    () => connections.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** One execution of a workflow. Holds enough state to pause and resume. */
export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  /** "waiting" = paused on a Manual Review node for human selection. */
  status: text("status", {
    enum: ["running", "waiting", "success", "error"],
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
});

/** On/off state for a registry plugin. The row id IS the plugin id. */
export const plugins = pgTable("plugins", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BrandRow = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Binding = typeof bindings.$inferSelect;
export type NewBinding = typeof bindings.$inferInsert;
export type RenderJob = typeof renderJobs.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type PluginRow = typeof plugins.$inferSelect;
export type NewPluginRow = typeof plugins.$inferInsert;
