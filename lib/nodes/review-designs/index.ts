import type { NodeDefinition } from "../types";
import { reviewDesignsMeta, type ReviewDesignsConfig } from "./meta";

type ReviewDesign = {
  url: string;
  attribution?: string;
  title?: string;
  renderUrls?: string[];
  sourceImageUrl?: string;
  index?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function urlFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const url = value.url ?? value.renderUrl ?? value.primaryUrl ?? value.chosen;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

function toReviewDesign(value: unknown, index: number): ReviewDesign | undefined {
  const url = urlFromValue(value);
  if (!url) return undefined;
  if (!isRecord(value)) return { url, index };
  return {
    ...value,
    url,
    index:
      typeof value.index === "number" && Number.isFinite(value.index)
        ? value.index
        : index,
    attribution:
      typeof value.attribution === "string"
        ? value.attribution
        : `Design ${index + 1}`,
    renderUrls: Array.isArray(value.renderUrls)
      ? value.renderUrls.filter((item): item is string => typeof item === "string")
      : undefined,
    sourceImageUrl:
      typeof value.sourceImageUrl === "string" ? value.sourceImageUrl : undefined,
  };
}

function normalizeDesigns(value: unknown): ReviewDesign[] {
  const raw =
    isRecord(value) && Array.isArray(value.designs)
      ? value.designs
      : isRecord(value) && Array.isArray(value.renderUrls)
        ? value.renderUrls
        : isRecord(value) && Array.isArray(value.candidates)
          ? value.candidates
          : isRecord(value) && Array.isArray(value.ranked)
            ? value.ranked
            : value;

  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const designs: ReviewDesign[] = [];
  for (const [index, item] of list.entries()) {
    const design = toReviewDesign(item, index);
    if (!design || seen.has(design.url)) continue;
    seen.add(design.url);
    designs.push(design);
  }
  return designs;
}

export const reviewDesignsNode: NodeDefinition<ReviewDesignsConfig> = {
  ...reviewDesignsMeta,

  async run(ctx) {
    const designs = normalizeDesigns(ctx.inputs.designs);
    if (designs.length === 0) {
      throw new Error("No generated designs were available for review.");
    }

    if (ctx.config.mode === "auto") {
      const chosenDesign = designs[0];
      return {
        type: "output",
        outputs: {
          chosen: chosenDesign.url,
          chosenDesign,
        },
      };
    }

    return {
      type: "pause",
      reason: "Awaiting manual design selection",
      state: {
        reviewKind: "designs",
        candidates: designs.slice(0, ctx.config.candidateCount),
      },
    };
  },
};
