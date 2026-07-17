import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { llmPromptMeta } from "./nodes/llm-prompt/meta";
import { categorizeImagesMeta } from "./nodes/categorize-images/meta";

export const aiPlugin: PluginManifest = {
  id: "ai",
  name: "AI",
  description: "Calls configured AI model connections from workflows.",
  defaultEnabled: true,
  nodes: [
    llmPromptMeta as unknown as NodeMeta,
    categorizeImagesMeta as unknown as NodeMeta,
  ],
};
