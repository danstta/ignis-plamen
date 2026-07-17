import { getTemplate } from "@/lib/templates/service";
import { collectPlaceholders, type PlaceholderData } from "@/lib/editor/types";
import type { NodeDefinition } from "@/lib/nodes/types";
import {
  renderTemplateBatchMeta,
  type RenderTemplateBatchConfig,
} from "./meta";
import {
  buildPlaceholderData,
  renderTemplateToStorage,
} from "../render-template/shared";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";

export type RenderedDesign = {
  index: number;
  url: string;
  renderUrls: string[];
  sourceImageUrl: string;
  templateId: string;
  input: PlaceholderData;
};

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

    const images = normalizeImageCandidates(ctx.inputs.images)
      .map((image) => image.url)
      .slice(0, ctx.config.count);
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
