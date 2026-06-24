import { z } from "zod";
import type { NodeMeta } from "../types";

export const manualReviewConfigSchema = z.object({
  mode: z.enum(["manual", "auto"]).default("manual"),
  candidateCount: z.coerce.number().int().min(1).max(10).default(3),
});

export type ManualReviewConfig = z.infer<typeof manualReviewConfigSchema>;

export const manualReviewMeta: NodeMeta<ManualReviewConfig> = {
  id: "manual-review",
  label: "Manual Review",
  description:
    "Choose the final image — automatically (top-ranked) or by pausing for a human pick.",
  category: "control",
  inputs: [{ id: "ranked", label: "Ranked images", kind: "data" }],
  outputs: [{ id: "chosen", label: "Chosen image", kind: "image" }],
  configFields: [
    {
      name: "mode",
      label: "Selection mode",
      type: "select",
      options: [
        { value: "manual", label: "Manual — pause and let me pick" },
        { value: "auto", label: "Auto — use the top-ranked image" },
      ],
    },
    {
      name: "candidateCount",
      label: "Candidates to review (manual)",
      type: "number",
      placeholder: "3",
    },
  ],
  configSchema: manualReviewConfigSchema,
};
