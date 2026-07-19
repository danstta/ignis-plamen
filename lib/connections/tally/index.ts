import { z } from "zod";
import type { ConnectionDefinition } from "@/lib/connections/types";

/**
 * Tally connected account. Key-based auth: a personal API key created in the
 * Tally app. Consumed by Tally action nodes (which call api.tally.so with this
 * key as a Bearer token).
 */
const configSchema = z.object({
  apiKey: z.string().default(""),
});

type TallyConfig = z.infer<typeof configSchema>;

export const tallyConnection: ConnectionDefinition<TallyConfig> = {
  id: "tally",
  name: "Tally",
  description: "Connect Tally via an API key to create and manage forms.",
  auth: {
    type: "keys",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "tly-…",
        help: "Create an API key in Tally under Settings → API keys.",
      },
    ],
  },
  configSchema,
};
