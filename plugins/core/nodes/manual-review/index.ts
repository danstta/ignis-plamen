import type { ImageCandidate, NodeDefinition } from "@/lib/nodes/types";
import { manualReviewMeta, type ManualReviewConfig } from "./meta";

/**
 * Selection gate with two modes:
 *  - auto:   pick the top-ranked image and continue without stopping.
 *  - manual: pause the run (engine sets status "waiting") and surface candidates
 *            for a human to choose; the engine injects { chosen } on resume.
 */
export const manualReviewNode: NodeDefinition<ManualReviewConfig> = {
  ...manualReviewMeta,

  async run(ctx) {
    const ranked = (ctx.inputs.ranked ?? []) as ImageCandidate[];

    if (ctx.config.mode === "auto") {
      const chosen = ranked[0]?.url ?? "";
      if (!chosen) throw new Error("No ranked images to choose from");
      return { type: "output", outputs: { chosen } };
    }

    const candidates = ranked.slice(0, ctx.config.candidateCount);
    if (candidates.length === 0) {
      throw new Error("No images available for review");
    }
    return {
      type: "pause",
      reason: "Awaiting manual image selection",
      state: { candidates },
    };
  },
};
