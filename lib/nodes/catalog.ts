import type { NodeMeta } from "./types";
import { webhookMeta } from "./webhook/meta";
import { findLocationImagesMeta } from "./find-location-images/meta";
import { rankImagesMeta } from "./rank-images/meta";
import { curateImagesMeta } from "./curate-images/meta";
import { llmPromptMeta } from "./llm-prompt/meta";
import { manualReviewMeta } from "./manual-review/meta";
import { renderTemplateMeta } from "./render-template/meta";
import { renderTemplateBatchMeta } from "./render-template-batch/meta";
import { reviewDesignsMeta } from "./review-designs/meta";
import { rehostImageMeta } from "./rehost-image/meta";
import { runLinkMeta } from "./run-link/meta";
import { routerMeta } from "./router/meta";
import { notionUpdatePageMeta } from "./notion-update-page/meta";
import { googleDriveListImagesMeta } from "./google-drive-list-images/meta";
import { googleDriveUploadFilesMeta } from "./google-drive-upload-files/meta";

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
  curateImagesMeta as unknown as NodeMeta,
  llmPromptMeta as unknown as NodeMeta,
  manualReviewMeta as unknown as NodeMeta,
  renderTemplateMeta as unknown as NodeMeta,
  renderTemplateBatchMeta as unknown as NodeMeta,
  reviewDesignsMeta as unknown as NodeMeta,
  rehostImageMeta as unknown as NodeMeta,
  runLinkMeta as unknown as NodeMeta,
  routerMeta as unknown as NodeMeta,
  notionUpdatePageMeta as unknown as NodeMeta,
  googleDriveListImagesMeta as unknown as NodeMeta,
  googleDriveUploadFilesMeta as unknown as NodeMeta,
];

const byId = new Map(catalog.map((m) => [m.id, m]));

export function listNodeCatalog(): NodeMeta[] {
  return catalog;
}

export function getNodeMeta(id: string): NodeMeta | undefined {
  return byId.get(id);
}

/**
 * Display label for a placed workflow node: its custom name when set, else the
 * node type's label. Every surface that shows a step name (canvas card, config
 * panel, token pickers, test results, run detail, engine logs) goes through
 * this so renames apply everywhere consistently.
 */
export function nodeDisplayLabel(node: { type: string; name?: string }): string {
  return node.name?.trim() || getNodeMeta(node.type)?.label || node.type;
}
