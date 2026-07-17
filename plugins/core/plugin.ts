import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { webhookMeta } from "./nodes/webhook/meta";
import { routerMeta } from "./nodes/router/meta";
import { rehostImageMeta } from "./nodes/rehost-image/meta";
import { manualReviewMeta } from "./nodes/manual-review/meta";
import { curateImagesMeta } from "./nodes/curate-images/meta";
import { renderTemplateMeta } from "./nodes/render-template/meta";
import { renderTemplateBatchMeta } from "./nodes/render-template-batch/meta";
import { previewDesignImageMeta } from "./nodes/preview-design-image/meta";
import { reviewDesignsMeta } from "./nodes/review-designs/meta";
import { runLinkMeta } from "./nodes/run-link/meta";

export const corePlugin: PluginManifest = {
  id: "core",
  name: "Core",
  description:
    "Built-in workflow nodes: webhook trigger, router branching, image rehosting, manual review, and template rendering.",
  defaultEnabled: true,
  nodes: [
    webhookMeta as unknown as NodeMeta,
    routerMeta as unknown as NodeMeta,
    rehostImageMeta as unknown as NodeMeta,
    manualReviewMeta as unknown as NodeMeta,
    curateImagesMeta as unknown as NodeMeta,
    renderTemplateMeta as unknown as NodeMeta,
    renderTemplateBatchMeta as unknown as NodeMeta,
    previewDesignImageMeta as unknown as NodeMeta,
    reviewDesignsMeta as unknown as NodeMeta,
    runLinkMeta as unknown as NodeMeta,
  ],
};
