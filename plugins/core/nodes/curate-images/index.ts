import {
  collectPlaceholders,
  isPlaceholderImageValue,
  placeholderValueToText,
  type PlaceholderData,
  type PlaceholderValue,
} from "@/lib/editor/types";
import { getTemplate } from "@/lib/templates/service";
import { valueToText } from "@/lib/workflows/references";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";
import type { ImageCandidate, NodeDefinition } from "@/lib/nodes/types";
import { curateImagesMeta, type CurateImagesConfig } from "./meta";

function outputsFromSelection(
  ranked: ImageCandidate[],
  selected: ImageCandidate[],
  previewPlaceholders: { key: string; kind: "text" | "image" }[] = [],
  bindings: Record<string, unknown> = {},
) {
  const selectedUrls = new Set(selected.map((candidate) => candidate.url));
  const curatedRanked = [
    ...selected,
    ...ranked.filter((candidate) => !selectedUrls.has(candidate.url)),
  ];
  const templateData = buildTemplateData(
    previewPlaceholders,
    bindings,
    selected.map((candidate) => candidate.url),
  );

  return {
    ranked: curatedRanked,
    selected,
    selectedUrls: selected.map((candidate) => candidate.url),
    templateData,
    best: selected[0]?.url ?? "",
  };
}

function buildTemplateData(
  placeholders: { key: string; kind: "text" | "image" }[],
  bindings: Record<string, unknown>,
  selectedUrls: string[],
): PlaceholderData {
  const data: PlaceholderData = {};
  let imageIndex = 0;
  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    if (placeholder.kind === "image") {
      const value = valueForImagePlaceholder(bound);
      data[placeholder.key] = value || selectedUrls[imageIndex] || "";
      imageIndex += 1;
    } else {
      data[placeholder.key] = valueForTextPlaceholder(bound);
    }
  }
  return data;
}

function valueForImagePlaceholder(value: unknown): PlaceholderValue {
  if (isPlaceholderImageValue(value)) return value;
  if (typeof value === "string") return value;
  return value !== undefined && value !== "" ? valueToText(value) : "";
}

function valueForTextPlaceholder(value: unknown): string {
  if (isPlaceholderImageValue(value) || typeof value === "string") {
    return placeholderValueToText(value);
  }
  return value !== undefined && value !== "" ? valueToText(value) : "";
}

export const curateImagesNode: NodeDefinition<CurateImagesConfig> = {
  ...curateImagesMeta,

  async run(ctx) {
    const ranked = normalizeImageCandidates(ctx.inputs.ranked);
    if (ranked.length === 0) {
      ctx.log("No images were available to curate.");
      return {
        type: "output",
        outputs: { ranked: [], selected: [], selectedUrls: [], best: "" },
      };
    }

    const selected = ranked.slice(0, ctx.config.selectionCount);
    const previewTemplate = ctx.config.templateId
      ? await getTemplate(ctx.config.templateId)
      : null;
    const previewPlaceholders = previewTemplate
      ? collectPlaceholders(previewTemplate.doc)
      : [];
    if (ctx.config.mode === "auto") {
      return {
        type: "output",
        outputs: outputsFromSelection(
          ranked,
          selected,
          previewPlaceholders,
          ctx.config.placeholders,
        ),
      };
    }

    return {
      type: "pause",
      reason: "Awaiting manual image curation",
      state: {
        reviewKind: "image-set",
        selectionCount: ctx.config.selectionCount,
        previewTemplateId: previewTemplate?.id ?? "",
        previewPlaceholders,
        previewBindings: ctx.config.placeholders,
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
