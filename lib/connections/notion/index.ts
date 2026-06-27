import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

/**
 * Notion connected account. Key-based auth: an internal integration token the
 * user creates in Notion and shares pages/databases with. Consumed by Notion
 * action nodes (which call the Notion API with this token).
 */
const configSchema = z.object({
  integrationToken: z.string().default(""),
});

type NotionConfig = z.infer<typeof configSchema>;

export const notionConnection: ConnectionDefinition<NotionConfig> = {
  id: "notion",
  name: "Notion",
  description: "Connect a Notion workspace via an internal integration token.",
  auth: {
    type: "keys",
    fields: [
      {
        name: "integrationToken",
        label: "Internal integration token",
        type: "password",
        placeholder: "ntn_… or secret_…",
        help: "Create an internal integration in Notion and share the relevant pages/databases with it.",
      },
    ],
  },
  configSchema,
};
