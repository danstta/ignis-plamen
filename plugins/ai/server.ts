import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { llmPromptNode } from "./nodes/llm-prompt";
import { categorizeImagesNode } from "./nodes/categorize-images";

export const aiPluginServer: PluginServer = {
  id: "ai",
  nodes: [
    llmPromptNode as unknown as NodeDefinition,
    categorizeImagesNode as unknown as NodeDefinition,
  ],
};
