import type { NodeDefinition } from "./types";
import { webhookNode } from "./webhook";
import { findLocationImagesNode } from "./find-location-images";
import { rankImagesNode } from "./rank-images";
import { manualReviewNode } from "./manual-review";
import { renderTemplateNode } from "./render-template";
import { renderTemplateBatchNode } from "./render-template-batch";
import { reviewDesignsNode } from "./review-designs";
import { rehostImageNode } from "./rehost-image";
import { routerNode } from "./router";
import { notionUpdatePageNode } from "./notion-update-page";

/**
 * Registry of available workflow node types. To add a node, implement a
 * NodeDefinition and list it here — the canvas palette, config panel, and engine
 * pick it up. Gating by enabled plugins happens in lib/plugins/service.
 */
const definitions: NodeDefinition[] = [
  webhookNode as unknown as NodeDefinition,
  findLocationImagesNode as unknown as NodeDefinition,
  rankImagesNode as unknown as NodeDefinition,
  manualReviewNode as unknown as NodeDefinition,
  renderTemplateNode as unknown as NodeDefinition,
  renderTemplateBatchNode as unknown as NodeDefinition,
  reviewDesignsNode as unknown as NodeDefinition,
  rehostImageNode as unknown as NodeDefinition,
  routerNode as unknown as NodeDefinition,
  notionUpdatePageNode as unknown as NodeDefinition,
];

const byId = new Map(definitions.map((d) => [d.id, d]));

export function listNodeTypes(): NodeDefinition[] {
  return definitions;
}

export function getNodeType(id: string): NodeDefinition | undefined {
  return byId.get(id);
}
