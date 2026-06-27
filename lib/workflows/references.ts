import { getNodeMeta } from "@/lib/nodes/catalog";

/**
 * Field propagation between connected nodes. Two surfaces share this module:
 *
 *  - The editor (config panel) computes which upstream fields are usable in a
 *    selected node — for the per-input mapping dropdowns and the `{{token}}`
 *    inserter.
 *  - The engine resolves `{{nodeId.path}}` tokens in a node's config against the
 *    already-computed outputs of upstream nodes before the node runs.
 *
 * Token format: `{{<sourceNodeId>.<dotPath>}}`. Node ids are UUIDs (no dots), so
 * the first dot-segment is always the node id and the rest is the path into that
 * node's outputs (e.g. `{{<id>.body.email}}` -> outputs[id].body.email).
 */

export type RefNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
};
export type RefEdge = { source: string; target: string };

/** A referenceable upstream value, shown in the config panel. */
export type FieldRef = {
  nodeId: string;
  nodeLabel: string;
  /** Human label, e.g. "Body" or "body.email". */
  label: string;
  /** Dot-path into the source node's outputs. */
  path: string;
  /** Insertable token. */
  token: string;
};

/** An upstream output port available to map into an input port. */
export type PortRef = {
  nodeId: string;
  nodeLabel: string;
  portId: string;
  portLabel: string;
};

function reachable(
  start: string,
  edges: RefEdge[],
  direction: "up" | "down",
): Set<string> {
  const out = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of edges) {
      const [from, to] =
        direction === "up" ? [e.target, e.source] : [e.source, e.target];
      if (from === cur && !out.has(to)) {
        out.add(to);
        stack.push(to);
      }
    }
  }
  out.delete(start);
  return out;
}

/**
 * Fields that `nodeId` may reference as `{{token}}`s: the outputs of every node
 * that isn't itself or one of its descendants (referencing a descendant would
 * form a cycle). Wiring is not required — a token reference *is* the dependency
 * (see referencedNodeIds), so any prior node's data can be picked directly.
 */
export function collectUpstreamFields(
  nodeId: string,
  nodes: RefNode[],
  edges: RefEdge[],
): FieldRef[] {
  const descendants = reachable(nodeId, edges, "down");
  const refs: FieldRef[] = [];
  for (const n of nodes) {
    if (n.id === nodeId || descendants.has(n.id)) continue;
    const meta = getNodeMeta(n.type);
    const nodeLabel = meta?.label ?? n.type;

    // Webhook nodes don't surface their raw body/headers/query ports. Instead the
    // user picks exact dot-paths from a captured sample (see WebhookFieldsDialog),
    // and only those become referenceable downstream. Nothing picked = nothing
    // exposed, so the "Data" picker stays scoped to what was deliberately chosen.
    if (n.type === "webhook") {
      const selected = (n.config?.selectedFields as string[] | undefined) ?? [];
      for (const path of selected) {
        refs.push({
          nodeId: n.id,
          nodeLabel,
          label: path,
          path,
          token: `{{${n.id}.${path}}}`,
        });
      }
      continue;
    }

    for (const out of meta?.outputs ?? []) {
      refs.push({
        nodeId: n.id,
        nodeLabel,
        label: out.label,
        path: out.id,
        token: `{{${n.id}.${out.id}}}`,
      });
    }
  }
  return refs;
}

/**
 * Node ids referenced by `{{nodeId.path}}` tokens anywhere in a value. Used by
 * the engine to order nodes that consume upstream data purely by token (no
 * explicit edge) — a render node bound to `{{webhook.body…}}` must still run
 * after the webhook even when nothing is wired into it.
 */
export function referencedNodeIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(TOKEN)) {
        const nodeId = m[1].trim().split(".")[0];
        if (nodeId && nodeId !== "trigger") ids.add(nodeId);
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return ids;
}

/**
 * Output ports that can feed an input of `nodeId` via an edge: every other node
 * that isn't a descendant (so connecting it never forms a cycle).
 */
export function collectConnectablePorts(
  nodeId: string,
  nodes: RefNode[],
  edges: RefEdge[],
): PortRef[] {
  const descendants = reachable(nodeId, edges, "down");
  const ports: PortRef[] = [];
  for (const n of nodes) {
    if (n.id === nodeId || descendants.has(n.id)) continue;
    const meta = getNodeMeta(n.type);
    if (!meta) continue;
    for (const out of meta.outputs) {
      ports.push({
        nodeId: n.id,
        nodeLabel: meta.label,
        portId: out.id,
        portLabel: out.label,
      });
    }
  }
  return ports;
}

/** Flatten a captured webhook payload into referenceable dot-paths + previews. */
export function flattenSample(
  payload: unknown,
  prefix = "",
  depth = 0,
): { path: string; preview: string }[] {
  if (depth > 3 || payload === null || typeof payload !== "object") {
    return prefix
      ? [{ path: prefix, preview: previewValue(payload) }]
      : [];
  }
  const out: { path: string; preview: string }[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && depth < 3) {
      out.push(...flattenSample(v, path, depth + 1));
    } else {
      out.push({ path, preview: previewValue(v) });
    }
  }
  return out;
}

function previewValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

// --- Runtime resolution (engine) ---

function lookup(
  ref: string,
  outputs: Record<string, Record<string, unknown>>,
  trigger: Record<string, unknown>,
): unknown {
  const [nodeId, ...path] = ref.split(".");
  let base: unknown = outputs[nodeId] ?? (nodeId === "trigger" ? trigger : undefined);
  for (const key of path) {
    if (base === null || base === undefined) return undefined;
    base = (base as Record<string, unknown>)[key];
  }
  return base;
}

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;
const EXACT = /^\{\{\s*([^}]+?)\s*\}\}$/;

function resolveString(
  s: string,
  outputs: Record<string, Record<string, unknown>>,
  trigger: Record<string, unknown>,
): unknown {
  const exact = s.match(EXACT);
  if (exact) return lookup(exact[1].trim(), outputs, trigger);
  return s.replace(TOKEN, (_, ref: string) => {
    const v = lookup(ref.trim(), outputs, trigger);
    if (v === null || v === undefined) return "";
    return typeof v === "string" ? v : JSON.stringify(v);
  });
}

/** Deep-replace `{{…}}` tokens in a node's config from upstream outputs. */
export function resolveReferences<T>(
  value: T,
  outputs: Record<string, Record<string, unknown>>,
  trigger: Record<string, unknown>,
): T {
  if (typeof value === "string") {
    return resolveString(value, outputs, trigger) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveReferences(v, outputs, trigger)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveReferences(v, outputs, trigger);
    }
    return out as T;
  }
  return value;
}
