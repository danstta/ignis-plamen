import { db } from "@/lib/db";
import { renderJobs } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates/service";
import { renderDocPages } from "@/lib/render/renderer";
import { storage } from "@/lib/storage";
import { collectPlaceholders, type PlaceholderData } from "@/lib/editor/types";
import { valueToText } from "@/lib/workflows/references";
import type { NodeDefinition } from "../types";
import { renderTemplateMeta, type RenderTemplateConfig } from "./meta";

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
    const doc = template.doc; // already normalized to v2 by getTemplate

    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const bindings = ctx.config.placeholders ?? {};

    const data: PlaceholderData = {};
    for (const ph of collectPlaceholders(doc)) {
      const bound = bindings[ph.key];
      data[ph.key] =
        bound !== undefined && bound !== ""
          ? valueToText(bound)
          : (fields[ph.key] ?? "");
      ctx.log(`placeholder "${ph.key}" (${ph.kind}) = ${data[ph.key] || "(empty)"}`);
    }

    const pngs = await renderDocPages(doc, data);
    ctx.log(`rendering ${pngs.length} page(s)`);

    const renderUrls: string[] = [];
    for (const png of pngs) {
      const key = `renders/${crypto.randomUUID()}.png`;
      const { url } = await storage().put(key, png, "image/png");
      renderUrls.push(url);
      await db().insert(renderJobs).values({
        templateId: template.id,
        input: data,
        outputUrl: url,
        status: "success",
      });
    }

    return {
      type: "output",
      outputs: { renderUrl: renderUrls[0], renderUrls },
    };
  },
};
