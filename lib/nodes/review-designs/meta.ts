import { z } from "zod";
import type { NodeMeta } from "../types";

export const REVIEW_DESIGNS_TYPE_ID = "review-designs";

export const reviewDesignsConfigSchema = z.object({
  mode: z.enum(["manual", "auto"]).default("manual"),
  candidateCount: z.coerce.number().int().min(1).max(50).default(5),
  instagramPreviewEnabled: z.coerce.boolean().default(false),
  instagramUsername: z.string().trim().default(""),
});

export type ReviewDesignsConfig = z.infer<typeof reviewDesignsConfigSchema>;

export const reviewDesignsMeta: NodeMeta<ReviewDesignsConfig> = {
  id: REVIEW_DESIGNS_TYPE_ID,
  label: "Review Designs",
  description:
    "Pauses the workflow so you can pick one generated design, then continues with that choice.",
  category: "control",
  inputs: [{ id: "designs", label: "Designs", kind: "data" }],
  outputs: [
    { id: "chosen", label: "Chosen design URL", kind: "image" },
    { id: "chosenDesign", label: "Chosen design", kind: "data" },
  ],
  configFields: [
    {
      name: "mode",
      label: "Selection mode",
      type: "select",
      options: [
        { value: "manual", label: "Manual - pause and let me pick" },
        { value: "auto", label: "Auto - use the first design" },
      ],
    },
    {
      name: "candidateCount",
      label: "Designs to review (manual)",
      type: "number",
      placeholder: "5",
    },
    {
      name: "instagramPreviewEnabled",
      label: "Instagram grid preview",
      type: "boolean",
      help: "When enabled, the paused review screen fetches the profile's latest 8 posts and previews each design as the next grid tile.",
    },
    {
      name: "instagramUsername",
      label: "Instagram username",
      type: "text",
      placeholder: "brandhandle",
      help: "Use a public username. Requires Instagram API credentials on the server.",
    },
  ],
  configSchema: reviewDesignsConfigSchema,
};
