import { collectPlaceholders, type PlaceholderData } from "@/lib/editor/types";
import { getTemplate } from "@/lib/templates/service";
import { valueToText } from "@/lib/workflows/references";
import type { ImageCandidate, NodeDefinition } from "../types";
import { normalizeImageCandidates } from "../image-input";
import {
  previewDesignImageMeta,
  type PreviewDesignImageConfig,
} from "./meta";

type PreviewPlaceholder = { key: string; kind: "text" | "image" };

function dynamicPlaceholderKey(
  placeholders: PreviewPlaceholder[],
  configuredKey: string,
  bindings: Record<string, unknown>,
): string {
  const configured = configuredKey.trim();
  if (configured) return configured;

  return (
    placeholders.find(
      (placeholder) =>
        placeholder.kind === "image" &&
        (bindings[placeholder.key] === undefined ||
          bindings[placeholder.key] === ""),
    )?.key ??
    placeholders.find((placeholder) => placeholder.kind === "image")?.key ??
    ""
  );
}

function buildTemplateData({
  placeholders,
  bindings,
  dynamicKey,
  imageUrl,
}: {
  placeholders: PreviewPlaceholder[];
  bindings: Record<string, unknown>;
  dynamicKey: string;
  imageUrl: string;
}): PlaceholderData {
  const data: PlaceholderData = {};
  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    data[placeholder.key] =
      placeholder.key === dynamicKey
        ? imageUrl
        : bound !== undefined && bound !== ""
          ? valueToText(bound)
          : "";
  }
  return data;
}

function outputsFromImage(
  image: ImageCandidate,
  placeholders: PreviewPlaceholder[],
  bindings: Record<string, unknown>,
  dynamicKey: string,
) {
  return {
    chosen: image.url,
    chosenImage: image,
    templateData: buildTemplateData({
      placeholders,
      bindings,
      dynamicKey,
      imageUrl: image.url,
    }),
  };
}

export const previewDesignImageNode: NodeDefinition<PreviewDesignImageConfig> = {
  ...previewDesignImageMeta,

  async run(ctx) {
    const template = await getTemplate(ctx.config.templateId);
    if (!template) throw new Error("Select a preview design.");

    const placeholders = collectPlaceholders(template.doc);
    const bindings = ctx.config.placeholders ?? {};
    const imagePlaceholderKey = dynamicPlaceholderKey(
      placeholders,
      ctx.config.imagePlaceholderKey,
      bindings,
    );
    if (!imagePlaceholderKey) {
      throw new Error("The selected design has no image placeholder.");
    }

    const images = normalizeImageCandidates(ctx.inputs.images).slice(
      0,
      ctx.config.candidateCount,
    );
    if (images.length === 0) {
      throw new Error("No input images were available to preview.");
    }

    if (ctx.config.mode === "auto") {
      return {
        type: "output",
        outputs: outputsFromImage(
          images[0],
          placeholders,
          bindings,
          imagePlaceholderKey,
        ),
      };
    }

    return {
      type: "pause",
      reason: "Awaiting design image selection",
      state: {
        reviewKind: "design-image",
        candidates: images,
        previewTemplateId: template.id,
        previewPlaceholders: placeholders,
        previewBindings: bindings,
        dynamicImagePlaceholderKey: imagePlaceholderKey,
      },
    };
  },
};
