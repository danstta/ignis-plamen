import type { NodeGroup, NodeMeta } from "./types";

/**
 * Palette/picker presentation of the node catalog: display labels per group and
 * the order step groups are listed in. Shared by the sidebar palette and the
 * insert-step picker so the two always group node types identically.
 */

export const NODE_GROUP_LABELS: Record<NodeGroup, string> = {
  trigger: "Trigger",
  media: "Media",
  ai: "AI",
  design: "Design",
  flow: "Flow",
  "google-drive": "Google Drive",
  notion: "Notion",
  tally: "Tally",
  utility: "Utility",
};

export const STEP_GROUP_ORDER: NodeGroup[] = [
  "media",
  "ai",
  "design",
  "google-drive",
  "notion",
  "tally",
  "flow",
  "utility",
];

/** Bucket step node types by group, in {@link STEP_GROUP_ORDER}; empty groups dropped. */
export function groupNodes(nodes: NodeMeta[]) {
  const grouped = new Map<NodeGroup, NodeMeta[]>();

  for (const node of nodes) {
    grouped.set(node.group, [...(grouped.get(node.group) ?? []), node]);
  }

  return STEP_GROUP_ORDER.map((group) => ({
    group,
    nodes: grouped.get(group) ?? [],
  })).filter((entry) => entry.nodes.length > 0);
}
