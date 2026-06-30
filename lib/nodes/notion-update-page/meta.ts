import { z } from "zod";
import type { NodeMeta } from "../types";

export const NOTION_UPDATE_PAGE_TYPE_ID = "notion-update-page";

export const notionPropertyTypes = [
  "title",
  "rich_text",
  "number",
  "checkbox",
  "select",
  "multi_select",
  "status",
  "date",
  "url",
  "email",
  "phone_number",
  "files",
] as const;

export type NotionPropertyType = (typeof notionPropertyTypes)[number];

export const notionPropertyTypeLabels: Record<NotionPropertyType, string> = {
  title: "Title",
  rich_text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  select: "Select",
  multi_select: "Multi-select",
  status: "Status",
  date: "Date",
  url: "URL",
  email: "Email",
  phone_number: "Phone",
  files: "Files",
};

export const notionPropertyUpdateSchema = z.object({
  id: z.string().default(""),
  name: z.string().default(""),
  type: z.enum(notionPropertyTypes).default("rich_text"),
  value: z.unknown().default(""),
});

export type NotionPropertyUpdate = z.infer<typeof notionPropertyUpdateSchema>;

export const notionUpdatePageConfigSchema = z.object({
  connectionId: z.string().default(""),
  pageId: z.string().default(""),
  properties: z.array(notionPropertyUpdateSchema).default([]),
});

export type NotionUpdatePageConfig = z.infer<
  typeof notionUpdatePageConfigSchema
>;

export const notionUpdatePageMeta: NodeMeta<NotionUpdatePageConfig> = {
  id: NOTION_UPDATE_PAGE_TYPE_ID,
  label: "Update Notion Page",
  description: "Updates selected Notion page properties from webhook or step data.",
  category: "output",
  inputs: [],
  outputs: [
    { id: "pageId", label: "Page ID", kind: "text" },
    { id: "url", label: "Page URL", kind: "text" },
    { id: "page", label: "Notion page", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Notion connection",
      type: "connection",
      connectionTypes: ["notion"],
      help: "The integration must have access to the page or database.",
    },
    {
      name: "pageId",
      label: "Page ID",
      type: "text",
      placeholder: "{{webhook.body.data.id}} or a literal page id",
      help: "Bind this from the webhook trigger when the trigger identifies the Notion page to edit.",
    },
  ],
  configSchema: notionUpdatePageConfigSchema,
};
