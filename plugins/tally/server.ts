import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { tallyCreateFormNode } from "./nodes/tally-create-form";

export const tallyPluginServer: PluginServer = {
  id: "tally",
  nodes: [tallyCreateFormNode as unknown as NodeDefinition],
};
