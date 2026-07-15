import { getNodeMeta, nodeDisplayLabel } from "@/lib/nodes/catalog";
import { CURATE_IMAGES_TYPE_ID } from "@/lib/nodes/curate-images/meta";
import { RANK_IMAGES_TYPE_ID } from "@/lib/nodes/rank-images/meta";

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
  /** Custom step name; shown instead of the type label in pickers when set. */
  name?: string;
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

function selectedOutputFields(n: RefNode): string[] {
  return ((n.config?.selectedOutputFields as string[] | undefined) ?? []).filter(
    Boolean,
  );
}

function rankImagesSelectionCount(n: RefNode): number {
  const value = Number(n.config?.selectionCount ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function rankImagesSelectedImagePaths(n: RefNode): string[] {
  if (n.type !== RANK_IMAGES_TYPE_ID && n.type !== CURATE_IMAGES_TYPE_ID) {
    return [];
  }
  return Array.from(
    { length: rankImagesSelectionCount(n) },
    (_, index) => `selected.${index}.url`,
  );
}

/** Output paths this node explicitly exposes to later steps. */
export function selectedOutputPaths(n: RefNode): string[] {
  if (n.type === "webhook") {
    return ((n.config?.selectedFields as string[] | undefined) ?? []).filter(
      Boolean,
    );
  }
  const declared = getNodeMeta(n.type)?.outputs.map((output) => output.id) ?? [];
  return [
    ...new Set([
      ...declared,
      ...rankImagesSelectedImagePaths(n),
      ...selectedOutputFields(n),
    ]),
  ];
}

function selectedOutputLabel(
  path: string,
  outputs: { id: string; label: string }[],
): string {
  const rankImageUrl = path.match(/^selected\.(\d+)\.url$/);
  if (rankImageUrl) return `Selected image ${Number(rankImageUrl[1]) + 1}`;
  return outputs.find((out) => out.id === path)?.label ?? path;
}

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
 * The editor is presented as an ordered workflow: a node may only read values
 * that come from earlier steps. Keep the descendant guard too so imported graphs
 * with unusual edges cannot expose values that would create a cycle.
 */
function priorNodes(
  nodeId: string,
  nodes: RefNode[],
  edges: RefEdge[],
): RefNode[] {
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index < 0) return [];
  const descendants = reachable(nodeId, edges, "down");
  return nodes.slice(0, index).filter((n) => !descendants.has(n.id));
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
  const refs: FieldRef[] = [];
  for (const n of priorNodes(nodeId, nodes, edges)) {
    const meta = getNodeMeta(n.type);
    const nodeLabel = nodeDisplayLabel(n);

    // Nothing selected means nothing exposed downstream. This keeps the Inputs
    // dropdowns and token pickers scoped to the contract the user chose.
    for (const path of selectedOutputPaths(n)) {
      refs.push({
        nodeId: n.id,
        nodeLabel,
        label: selectedOutputLabel(path, meta?.outputs ?? []),
        path,
        token: `{{${n.id}.${path}}}`,
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
  const ports: PortRef[] = [];
  for (const n of priorNodes(nodeId, nodes, edges)) {
    const meta = getNodeMeta(n.type);
    if (!meta) continue;
    for (const path of selectedOutputPaths(n)) {
      ports.push({
        nodeId: n.id,
        nodeLabel: nodeDisplayLabel(n),
        portId: path,
        portLabel: selectedOutputLabel(path, meta.outputs),
      });
    }
  }
  return ports;
}

/** A path segment that is a bare integer — an array index in a captured sample. */
const ARRAY_INDEX = /^\d+$/;

/**
 * Normalize a literal dot-path to a structural one by replacing array-index
 * segments with `*`: `items.0.title` -> `items.*.title`. This is what lets a
 * selection describe the payload's *shape* instead of one captured request's
 * positions. (A numeric *object* key is indistinguishable from an index in a
 * dot-path and is wildcarded too; `*` still resolves it — see resolvePathMatches.)
 */
export function toStructuralPath(path: string): string {
  return path
    .split(".")
    .map((seg) => (ARRAY_INDEX.test(seg) ? "*" : seg))
    .join(".");
}

/**
 * Discover the referenceable dot-paths in a captured webhook payload (+ a value
 * preview for each), as *structural* paths: array indices collapse to `*`, so
 * `items.0.title` and `items.1.title` both surface once as `items.*.title` (first
 * preview kept). See resolvePathMatches for how `*` resolves at run time.
 */
export function flattenSample(
  payload: unknown,
): { path: string; preview: string }[] {
  const seen = new Set<string>();
  const out: { path: string; preview: string }[] = [];
  for (const { path, preview } of flattenRaw(payload)) {
    const structural = toStructuralPath(path);
    if (seen.has(structural)) continue;
    seen.add(structural);
    out.push({ path: structural, preview });
  }
  return out;
}

/** Raw recursive flatten: every leaf (and capped-depth container) as a literal dot-path. */
function flattenRaw(
  payload: unknown,
  prefix = "",
  depth = 0,
): { path: string; preview: string }[] {
  if (depth > 3 || payload === null || typeof payload !== "object") {
    return prefix ? [{ path: prefix, preview: previewValue(payload) }] : [];
  }
  const out: { path: string; preview: string }[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && depth < 3) {
      out.push(...flattenRaw(v, path, depth + 1));
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

/**
 * Resolve a `<nodeId>.<dotPath>` reference against computed outputs (or the
 * trigger). A path may contain `*` wildcard segments (from structural webhook
 * selections): a wildcard yields every match, so the result is the single value
 * when exactly one matches, an array when several do, and undefined when none do.
 * Wildcard-free paths keep the original single-value fast path unchanged.
 */
function lookup(
  ref: string,
  outputs: Record<string, Record<string, unknown>>,
  trigger: Record<string, unknown>,
): unknown {
  const [nodeId, ...path] = ref.split(".");
  const root: unknown =
    outputs[nodeId] ?? (nodeId === "trigger" ? trigger : undefined);
  if (!path.includes("*")) {
    let base: unknown = root;
    for (const key of path) {
      if (base === null || base === undefined) return undefined;
      base = (base as Record<string, unknown>)[key];
    }
    return base;
  }
  const matches = resolvePathMatches(root, path);
  return matches.length === 0
    ? undefined
    : matches.length === 1
      ? matches[0]
      : matches;
}

/**
 * Every value reachable from `root` along `segments`, in document order, where a
 * `*` segment matches any array element or any object value. Returns [] when the
 * path doesn't resolve. Shared by token resolution (lookup) and webhook payload
 * validation, so "what a path matches" and "what counts as present" never drift.
 * An explicit `null` leaf counts as a match (it was deliberately sent); a missing
 * key (`undefined`) does not.
 */
export function resolvePathMatches(root: unknown, segments: string[]): unknown[] {
  let frontier: unknown[] = root === undefined ? [] : [root];
  for (const seg of segments) {
    const next: unknown[] = [];
    for (const cur of frontier) {
      if (cur === null || cur === undefined) continue;
      if (seg === "*") {
        if (Array.isArray(cur)) {
          for (const v of cur) if (v !== undefined) next.push(v);
        } else if (typeof cur === "object") {
          for (const v of Object.values(cur as Record<string, unknown>)) {
            if (v !== undefined) next.push(v);
          }
        }
      } else if (typeof cur === "object") {
        const v = (cur as Record<string, unknown>)[seg];
        if (v !== undefined) next.push(v);
      }
    }
    frontier = next;
  }
  return frontier;
}

/**
 * Which of `paths` are absent from `payload` — i.e. resolve to zero values. A
 * webhook's locked-in (selected) paths are its expected contract; the engine fails
 * a run up-front when any are missing, instead of silently rendering blanks (see
 * startRun). `payload` is the trigger envelope `{ body, headers, query }`, matching
 * how selections are captured.
 */
export function validateLockedPaths(payload: unknown, paths: string[]): string[] {
  return paths.filter(
    (p) => resolvePathMatches(payload, p.split(".")).length === 0,
  );
}

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;
const EXACT = /^\{\{\s*([^}]+?)\s*\}\}$/;

/**
 * Coerce a resolved token value to display text. Strings pass through; numbers and
 * booleans stringify; an array (e.g. a `*` wildcard match) joins its non-empty
 * parts with ", "; anything else is JSON. Used for interpolated tokens here and by
 * nodes that fill a single text/image slot (e.g. render-template), so a one-element
 * wildcard match renders as that element and a multi-element one reads as a list.
 */
export function valueToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v
      .map(valueToText)
      .filter((s) => s !== "")
      .join(", ");
  }
  return JSON.stringify(v);
}

function resolveString(
  s: string,
  outputs: Record<string, Record<string, unknown>>,
  trigger: Record<string, unknown>,
): unknown {
  const exact = s.match(EXACT);
  if (exact) return lookup(exact[1].trim(), outputs, trigger);
  return s.replace(TOKEN, (_, ref: string) =>
    valueToText(lookup(ref.trim(), outputs, trigger)),
  );
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
