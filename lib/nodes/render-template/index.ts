import { db } from "@/lib/db";
import { renderJobs } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates/service";
import { getRenderer } from "@/lib/render/renderer";
import { storage } from "@/lib/storage";
import {
  collectPlaceholders,
  type PlaceholderData,
  type TemplateDoc,
} from "@/lib/editor/types";
import type { NodeDefinition } from "../types";
import { renderTemplateMeta, type RenderTemplateConfig } from "./meta";

/** Coerce a resolved binding value to the string a placeholder expects. */
function toText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/**
 * Renders a design template to a PNG. Each template placeholder (text or image)
 * is filled from its configured binding — literal text or a `{{nodeId.path}}`
 * token already resolved against upstream outputs. Unbound placeholders fall
 * back to the trigger's field map by name (legacy Notion behaviour).
 */
export const renderTemplateNode: NodeDefinition<RenderTemplateConfig> = {
  ...renderTemplateMeta,

  async run(ctx) {
    const template = await getTemplate(ctx.config.templateId);
    if (!template) throw new Error("Template not found");
    const doc = template.doc as TemplateDoc;

    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const bindings = ctx.config.placeholders ?? {};

    const data: PlaceholderData = {};
    for (const ph of collectPlaceholders(doc)) {
      const bound = bindings[ph.key];
      data[ph.key] =
        bound !== undefined && bound !== ""
          ? toText(bound)
          : (fields[ph.key] ?? "");
      ctx.log(`placeholder "${ph.key}" (${ph.kind}) = ${data[ph.key] || "(empty)"}`);
    }

    const png = await getRenderer().render({ doc, data });
    const key = `renders/${crypto.randomUUID()}.png`;
    const { url } = await storage().put(key, png, "image/png");

    await db().insert(renderJobs).values({
      templateId: template.id,
      input: data,
      outputUrl: url,
      status: "success",
    });

    return { type: "output", outputs: { renderUrl: url } };
  },
};
