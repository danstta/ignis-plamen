import { getTemplate } from "@/lib/templates/service";
import type { NodeDefinition } from "../types";
import { renderTemplateMeta, type RenderTemplateConfig } from "./meta";
import { buildPlaceholderData, renderTemplateToStorage } from "./shared";

/**
 * Renders a design template to PNGs — one per page. Each template placeholder
 * (text or image) is filled from its configured binding — literal text or a
 * `{{nodeId.path}}` token already resolved against upstream outputs. Unbound
 * placeholders fall back to the trigger's field map by name (legacy Notion
 * behaviour).
 *
 * Outputs `renderUrls` (every page, in order) plus `renderUrl` (the first page),
 * so single-page designs and any downstream node reading `renderUrl` are
 * unchanged.
 */
export const renderTemplateNode: NodeDefinition<RenderTemplateConfig> = {
  ...renderTemplateMeta,

  async run(ctx) {
    const template = await getTemplate(ctx.config.templateId);
    if (!template) throw new Error("Template not found");
    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const bindings = ctx.config.placeholders ?? {};

    const data = buildPlaceholderData({
      doc: template.doc,
      bindings,
      fallbackFields: fields,
      log: ctx.log,
    });

    const renderUrls = await renderTemplateToStorage(template, data);
    ctx.log(`rendered ${renderUrls.length} page(s)`);

    return {
      type: "output",
      outputs: { renderUrl: renderUrls[0], renderUrls },
    };
  },
};
