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

/**
 * Renders a design template to a PNG. The chosen image (wired into the `image`
 * input) fills the configured image placeholder; every other placeholder is
 * filled by-name from the trigger's field map (e.g. Notion property "Title"
 * fills placeholder "Title"). Subsumes the legacy bindings table.
 */
export const renderTemplateNode: NodeDefinition<RenderTemplateConfig> = {
  ...renderTemplateMeta,

  async run(ctx) {
    const template = await getTemplate(ctx.config.templateId);
    if (!template) throw new Error("Template not found");
    const doc = template.doc as TemplateDoc;

    const fields = (ctx.trigger.fields ?? {}) as Record<string, string>;
    const image = String(ctx.inputs.image ?? "");

    const data: PlaceholderData = {};
    for (const ph of collectPlaceholders(doc)) {
      data[ph.key] =
        ph.key === ctx.config.imagePlaceholderKey
          ? image
          : (fields[ph.key] ?? "");
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
