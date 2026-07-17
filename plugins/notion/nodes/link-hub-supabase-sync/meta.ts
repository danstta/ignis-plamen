import { z } from "zod";
import type { NodeMeta } from "@/lib/nodes/types";

export const LINK_HUB_SUPABASE_SYNC_TYPE_ID = "link-hub-supabase-sync";

const propertyMappingSchema = z.unknown();

export const linkHubSupabaseSyncConfigSchema = z.object({
  projectNameProperty: propertyMappingSchema.default("Ime projekta"),
  infopackLinkProperty: propertyMappingSchema.default("Infopack link"),
  googleFormLinkProperty: propertyMappingSchema.default("Google form link"),
  projectCountryProperty: propertyMappingSchema.default("Država"),
  showOnLinksProperty: propertyMappingSchema.default("Show on links"),
  callDeadlineProperty: propertyMappingSchema.default("Rok poziva"),
  sortOrderProperty: propertyMappingSchema.default("Sort order"),
  allowNotionApiFallback: z.boolean().default(true),
});

export type LinkHubSupabaseSyncConfig = z.infer<
  typeof linkHubSupabaseSyncConfigSchema
>;

export const linkHubSupabaseSyncMeta: NodeMeta<LinkHubSupabaseSyncConfig> = {
  id: LINK_HUB_SUPABASE_SYNC_TYPE_ID,
  label: "Sync Link Hub",
  description:
    "Upserts Link Hub project rows into Supabase from a Notion webhook payload.",
  category: "output",
  group: "notion",
  inputs: [{ id: "payload", label: "Payload", kind: "data" }],
  outputs: [
    { id: "result", label: "Result", kind: "data" },
    { id: "project", label: "Project row", kind: "data" },
    { id: "mode", label: "Mode", kind: "text" },
    { id: "upserted", label: "Upserted", kind: "data" },
    { id: "hidden", label: "Hidden", kind: "data" },
  ],
  configFields: [
    {
      name: "projectNameProperty",
      label: "Project title property",
      type: "text",
      defaultValue: "Ime projekta",
      help: "Notion property that maps to project_name.",
    },
    {
      name: "infopackLinkProperty",
      label: "Infopack link property",
      type: "text",
      defaultValue: "Infopack link",
      help: "Notion property that maps to infopack_link.",
    },
    {
      name: "googleFormLinkProperty",
      label: "Apply link property",
      type: "text",
      defaultValue: "Google form link",
      help: "Notion property that maps to google_form_link.",
    },
    {
      name: "projectCountryProperty",
      label: "Country property",
      type: "text",
      defaultValue: "Država",
      help: "Notion property that maps to project_country.",
    },
    {
      name: "showOnLinksProperty",
      label: "Visible checkbox property",
      type: "text",
      defaultValue: "Show on links",
      help: "Notion checkbox property that controls show_on_links.",
    },
    {
      name: "callDeadlineProperty",
      label: "Deadline property",
      type: "text",
      defaultValue: "Rok poziva",
      help: "Notion date property that maps to call_deadline.",
    },
    {
      name: "sortOrderProperty",
      label: "Sort order property",
      type: "text",
      defaultValue: "Sort order",
      help: "Optional Notion number property that maps to sort_order.",
    },
    {
      name: "allowNotionApiFallback",
      label: "Use Notion API fallback",
      type: "boolean",
      defaultValue: true,
      help: "When the webhook only contains a page/data source id, fetch the latest properties from Notion before writing Supabase.",
    },
  ],
  configSchema: linkHubSupabaseSyncConfigSchema,
};
