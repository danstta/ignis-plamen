import { z } from "zod";
import type { NodeMeta } from "../types";

export const notionTriggerConfigSchema = z.object({
  connectionId: z.string().default(""),
  locationProperty: z.string().default("Location"),
});

export type NotionTriggerConfig = z.infer<typeof notionTriggerConfigSchema>;

export const notionTriggerMeta: NodeMeta<NotionTriggerConfig> = {
  id: "notion-trigger",
  label: "Notion Trigger",
  description:
    "Starts the workflow from a Notion webhook and reads the Location property.",
  category: "trigger",
  inputs: [],
  outputs: [
    { id: "location", label: "Location", kind: "text" },
    { id: "fields", label: "All fields", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Notion connection",
      type: "connection",
      help: "The verified Notion connection whose webhook fires this workflow.",
    },
    {
      name: "locationProperty",
      label: "Location property name",
      type: "text",
      placeholder: "Location",
      help: "Notion page property to read the place name from.",
    },
  ],
  configSchema: notionTriggerConfigSchema,
};
