import type { NodeMeta } from "./types";
import { webhookMeta } from "./webhook/meta";
import { findLocationImagesMeta } from "./find-location-images/meta";
import { rankImagesMeta } from "./rank-images/meta";
import { manualReviewMeta } from "./manual-review/meta";
import { renderTemplateMeta } from "./render-template/meta";
import { renderTemplateBatchMeta } from "./render-template-batch/meta";
import { reviewDesignsMeta } from "./review-designs/meta";
import { rehostImageMeta } from "./rehost-image/meta";
import { routerMeta } from "./router/meta";
import { notionUpdatePageMeta } from "./notion-update-page/meta";

/**
 * Client-safe node catalog: metadata only (no run()), so the canvas palette,
 * node renderer, config panel, and store can import it without dragging
 * server-only modules (db, storage, renderer) into the browser bundle. The full
 * server registry lives in ./registry.
 */
const catalog: NodeMeta[] = [
  webhookMeta as unknown as NodeMeta,
  findLocationImagesMeta as unknown as NodeMeta,
  rankImagesMeta as unknown as NodeMeta,
  manualReviewMeta as unknown as NodeMeta,
  renderTemplateMeta as unknown as NodeMeta,
  renderTemplateBatchMeta as unknown as NodeMeta,
  reviewDesignsMeta as unknown as NodeMeta,
  rehostImageMeta as unknown as NodeMeta,
  routerMeta as unknown as NodeMeta,
  notionUpdatePageMeta as unknown as NodeMeta,
];

const byId = new Map(catalog.map((m) => [m.id, m]));

export function listNodeCatalog(): NodeMeta[] {
  return catalog;
}

export function getNodeMeta(id: string): NodeMeta | undefined {
  return byId.get(id);
}
