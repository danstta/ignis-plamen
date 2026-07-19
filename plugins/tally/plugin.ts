import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { tallyCreateFormMeta } from "./nodes/tally-create-form/meta";

export const tallyPlugin: PluginManifest = {
  id: "tally",
  name: "Tally",
  description:
    "Creates Tally forms from template forms, fills placeholders, and returns share links.",
  nodes: [tallyCreateFormMeta as unknown as NodeMeta],
};
