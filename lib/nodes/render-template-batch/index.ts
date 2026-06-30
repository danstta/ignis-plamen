import { getTemplate } from "@/lib/templates/service";
import { collectPlaceholders, type PlaceholderData } from "@/lib/editor/types";
import type { NodeDefinition } from "../types";
import {
  renderTemplateBatchMeta,
  type RenderTemplateBatchConfig,
} from "./meta";
import {
  buildPlaceholderData,
  renderTemplateToStorage,
} from "../render-template/shared";

export type RenderedDesign = {
  index: number;
  url: string;
  renderUrls: string[];
  sourceImageUrl: string;
  templateId: string;
  input: PlaceholderData;
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

function imageListFrom(value: unknown): string[] {
  const raw =
    isRecord(value) && Array.isArray(value.images)
      ? value.images
      : isRecord(value) && Array.isArray(value.candidates)
        ? value.candidates
        : isRecord(value) && Array.isArray(value.ranked)
          ? value.ranked
          : isRecord(value) && Array.isArray(value.renderUrls)
            ? value.renderUrls
            : isRecord(value) && Array.isArray(value.designs)
              ? value.designs
              : value;

  if (!Array.isArray(raw)) {
    const one = urlFromValue(raw);
    return one ? [one] : [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of raw) {
    const url = urlFromValue(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export const renderTemplateBatchNode: NodeDefinition<RenderTemplateBatchConfig> = {
  ...renderTemplateBatchMeta,

  async run(ctx) {
    const template = await getTemplate(ctx.config.templateId);
    if (!template) throw new Error("Template not found");

    const imagePlaceholders = collectPlaceholders(template.doc).filter(
      (ph) => ph.kind === "image",
    );
    const imagePlaceholderKey =
      ctx.config.imagePlaceholderKey.trim() || imagePlaceholders[0]?.key;
    if (!imagePlaceholderKey) {
      throw new Error("The selected template has no image placeholder.");
    }

    const images = imageListFrom(ctx.inputs.images).slice(0, ctx.config.count);
    if (images.length === 0) {
      throw new Error("No input images were available to render.");
    }

    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const bindings = ctx.config.placeholders ?? {};
    const designs: RenderedDesign[] = [];

    for (const [index, sourceImageUrl] of images.entries()) {
      ctx.log(
        `rendering version ${index + 1}/${images.length} with "${imagePlaceholderKey}"`,
      );
      const input = buildPlaceholderData({
        doc: template.doc,
        bindings,
        fallbackFields: fields,
        overrides: { [imagePlaceholderKey]: sourceImageUrl },
      });
      const renderUrls = await renderTemplateToStorage(template, input);
      designs.push({
        index,
        url: renderUrls[0] ?? "",
        renderUrls,
        sourceImageUrl,
        templateId: template.id,
        input,
      });
    }

    const renderUrls = designs.map((design) => design.url).filter(Boolean);
    return {
      type: "output",
      outputs: {
        designs,
        renderUrls,
        renderUrl: renderUrls[0],
      },
    };
  },
};
