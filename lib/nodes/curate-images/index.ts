import type { ImageCandidate, NodeDefinition } from "../types";
import { curateImagesMeta, type CurateImagesConfig } from "./meta";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isImageCandidate(value: unknown): value is ImageCandidate {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.trim() !== ""
  );
}

function normalizeImages(value: unknown): ImageCandidate[] {
  const raw =
    isRecord(value) && Array.isArray(value.ranked)
      ? value.ranked
      : isRecord(value) && Array.isArray(value.selected)
        ? value.selected
        : isRecord(value) && Array.isArray(value.candidates)
          ? value.candidates
          : value;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const images: ImageCandidate[] = [];
  for (const item of raw) {
    const candidate = isImageCandidate(item)
      ? item
      : typeof item === "string" && item.trim()
        ? { url: item.trim(), attribution: "" }
        : undefined;
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    images.push(candidate);
  }
  return images;
}

function outputsFromSelection(
  ranked: ImageCandidate[],
  selected: ImageCandidate[],
) {
  const selectedUrls = new Set(selected.map((candidate) => candidate.url));
  const curatedRanked = [
    ...selected,
    ...ranked.filter((candidate) => !selectedUrls.has(candidate.url)),
  ];

  return {
    ranked: curatedRanked,
    selected,
    selectedUrls: selected.map((candidate) => candidate.url),
    best: selected[0]?.url ?? "",
  };
}

export const curateImagesNode: NodeDefinition<CurateImagesConfig> = {
  ...curateImagesMeta,

  async run(ctx) {
    const ranked = normalizeImages(ctx.inputs.ranked);
    if (ranked.length === 0) {
      ctx.log("No ranked images were available to curate.");
      return {
        type: "output",
        outputs: { ranked: [], selected: [], selectedUrls: [], best: "" },
      };
    }

    const selected = ranked.slice(0, ctx.config.selectionCount);
    if (ctx.config.mode === "auto") {
      return { type: "output", outputs: outputsFromSelection(ranked, selected) };
    }

    return {
      type: "pause",
      reason: "Awaiting manual image curation",
      state: {
        reviewKind: "image-set",
        selectionCount: ctx.config.selectionCount,
        selected,
        alternates: ranked.slice(
          ctx.config.selectionCount,
          ctx.config.selectionCount + ctx.config.alternateCount,
        ),
        candidates: ranked.slice(
          0,
          ctx.config.selectionCount + ctx.config.alternateCount,
        ),
        ranked,
      },
    };
  },
};
