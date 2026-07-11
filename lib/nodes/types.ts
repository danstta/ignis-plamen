import type { ZodType } from "zod";
import type { NodeOutputs } from "@/lib/workflows/types";

/**
 * The workflow node contract. Adding a node type = implement this and register it
 * in `registry.ts`. The canvas palette, the generic node renderer (one Handle per
 * port), the config panel, and the execution engine are all driven off these
 * definitions — mirroring the connection registry pattern.
 */

/** A typed input/output port. `kind` informs handle styling and binding hints. */
export interface NodePort {
  id: string;
  label: string;
  kind: "text" | "image" | "data";
}

/** A config input the generic node config panel renders. */
export interface NodeConfigField {
  name: string;
  label: string;
  type:
    | "text"
    | "boolean"
    | "password"
    | "number"
    | "textarea"
    | "select"
    | "checkbox-group"
    | "connection"
    | "template";
  /** Options for `select` and `checkbox-group`. */
  options?: { value: string; label: string }[];
  /** Fallback value used by generic field renderers before a config is saved. */
  defaultValue?: unknown;
  /** Reads an older config field when this field has not been saved yet. */
  legacyValueField?: string;
  /** Maps an older single config value into this field's current shape. */
  legacyValueMap?: { field: string; values: Record<string, unknown> };
  /** Limits a connection picker to these provider ids. */
  connectionTypes?: string[];
  /** Builds select options from the model list exposed by another connection field. */
  modelSource?: { connectionField: string };
  placeholder?: string;
  help?: string;
}

export type NodeCategory =
  | "trigger"
  | "source"
  | "transform"
  | "control"
  | "output";

export type NodeGroup =
  | "trigger"
  | "media"
  | "ai"
  | "design"
  | "flow"
  | "google-drive"
  | "notion"
  | "utility";

/** What a node's run produced: resolved outputs, or a pause for human input. */
export type RunResult =
  | { type: "output"; outputs: NodeOutputs }
  | { type: "pause"; reason?: string; state: Record<string, unknown> };

/** Everything a node's run() needs. */
export interface NodeRunContext<C = Record<string, unknown>> {
  /** Validated config for this node instance. */
  config: C;
  /** Original config before `{{...}}` references were resolved. */
  rawConfig?: Record<string, unknown>;
  /** Resolved input values keyed by input port id (from upstream node outputs). */
  inputs: Record<string, unknown>;
  /** The run's trigger payload (e.g. Notion { recordId, fields }). */
  trigger: Record<string, unknown>;
  runId: string;
  /** Append a line to the run log (best-effort; never throws). */
  log: (message: string) => void | Promise<void>;
  /** True when the user has stopped the run while this node is still working. */
  isStopped?: () => Promise<boolean>;
  /** Throws a cooperative stop signal when the run has been stopped. */
  throwIfStopped?: () => Promise<void>;
}

/**
 * Client-safe node metadata. Contains everything the canvas palette, generic node
 * renderer, and config panel need — and crucially NO `run()`, so importing it never
 * drags server-only modules (db, storage, renderer) into the client bundle.
 */
export interface NodeMeta<C extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable type id stored on graph nodes, e.g. "webhook". */
  id: string;
  label: string;
  description: string;
  category: NodeCategory;
  /** User-facing palette group. Runtime behavior is driven by `category`. */
  group: NodeGroup;
  inputs: NodePort[];
  outputs: NodePort[];
  configFields: NodeConfigField[];
  /** Validates/normalizes a node's stored config. */
  configSchema: ZodType<C>;
}

/** A node's full server-side definition: its metadata plus the run implementation. */
export interface NodeDefinition<C extends Record<string, unknown> = Record<string, unknown>>
  extends NodeMeta<C> {
  /** Execute the node. Throw to fail the run; return a pause to wait for input. */
  run(ctx: NodeRunContext<C>): Promise<RunResult>;
}

/** Shared candidate-image shape produced by Find Location Images and consumed downstream. */
export interface ImageCandidate {
  url: string;
  attribution: string;
  previewUrl?: string;
  mimeType?: string;
  name?: string;
  thumbnailLink?: string;
  widthPx?: number;
  heightPx?: number;
  title?: string;
  source?: string;
  license?: string;
  licenseUrl?: string;
  attributionUrl?: string;
  locationQuery?: string;
  locationQueryIndex?: number;
}
