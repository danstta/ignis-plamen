import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { webhookNode } from "./nodes/webhook";
import { routerNode } from "./nodes/router";
import { rehostImageNode } from "./nodes/rehost-image";
import { manualReviewNode } from "./nodes/manual-review";
import { curateImagesNode } from "./nodes/curate-images";
import { renderTemplateNode } from "./nodes/render-template";
import { renderTemplateBatchNode } from "./nodes/render-template-batch";
import { previewDesignImageNode } from "./nodes/preview-design-image";
import { reviewDesignsNode } from "./nodes/review-designs";
import { runLinkNode } from "./nodes/run-link";

export const corePluginServer: PluginServer = {
  id: "core",
  nodes: [
    webhookNode as unknown as NodeDefinition,
    routerNode as unknown as NodeDefinition,
    rehostImageNode as unknown as NodeDefinition,
    manualReviewNode as unknown as NodeDefinition,
    curateImagesNode as unknown as NodeDefinition,
    renderTemplateNode as unknown as NodeDefinition,
    renderTemplateBatchNode as unknown as NodeDefinition,
    previewDesignImageNode as unknown as NodeDefinition,
    reviewDesignsNode as unknown as NodeDefinition,
    runLinkNode as unknown as NodeDefinition,
  ],
};
