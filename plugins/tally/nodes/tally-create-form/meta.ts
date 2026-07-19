import { z } from "zod";
import type { NodeMeta } from "@/lib/nodes/types";

export const TALLY_CREATE_FORM_TYPE_ID = "tally-create-form";

export const tallyReplacementSchema = z.object({
  id: z.string().default(""),
  token: z.string().default(""),
  value: z.unknown().default(""),
});

export type TallyReplacement = z.infer<typeof tallyReplacementSchema>;

export const tallyCreateFormConfigSchema = z.object({
  connectionId: z.string().default(""),
  templateFormId: z.string().default(""),
  formTitle: z.string().default(""),
  publish: z.boolean().default(true),
  replacements: z.array(tallyReplacementSchema).default([]),
});

export type TallyCreateFormConfig = z.infer<typeof tallyCreateFormConfigSchema>;

export const tallyCreateFormMeta: NodeMeta<TallyCreateFormConfig> = {
  id: TALLY_CREATE_FORM_TYPE_ID,
  label: "Create Tally Form",
  description:
    "Copies a Tally form you use as a template, fills its {{placeholders}}, and outputs the share link.",
  category: "output",
  group: "tally",
  inputs: [],
  outputs: [
    { id: "formId", label: "Form ID", kind: "text" },
    { id: "url", label: "Share link", kind: "text" },
    { id: "name", label: "Form name", kind: "text" },
    { id: "form", label: "Tally form", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Tally connection",
      type: "connection",
      connectionTypes: ["tally"],
    },
    {
      name: "templateFormId",
      label: "Template form ID",
      type: "text",
      placeholder: "e.g. wMbJyL",
      help: "The form to copy — the id from its URL, tally.so/forms/<id>/edit.",
    },
    {
      name: "formTitle",
      label: "Form title",
      type: "text",
      placeholder: "New form name — or insert data",
      help: "Names the created form in Tally. Leave empty to keep the template's title.",
    },
    {
      name: "publish",
      label: "Publish immediately",
      type: "boolean",
      defaultValue: true,
      help: "Publishes the copy so the share link accepts submissions. Turn off to create a draft.",
    },
  ],
  configSchema: tallyCreateFormConfigSchema,
};
