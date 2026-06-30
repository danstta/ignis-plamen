import { db } from "@/lib/db";
import { renderJobs, type Template } from "@/lib/db/schema";
import { renderDocPages } from "@/lib/render/renderer";
import { storage } from "@/lib/storage";
import { collectPlaceholders, type PlaceholderData } from "@/lib/editor/types";
import { valueToText } from "@/lib/workflows/references";

export function buildPlaceholderData({
  doc,
  bindings,
  fallbackFields,
  overrides = {},
  log,
}: {
  doc: Template["doc"];
  bindings: Record<string, unknown>;
  fallbackFields: Record<string, string>;
  overrides?: Record<string, string>;
  log?: (message: string) => void;
}): PlaceholderData {
  const data: PlaceholderData = {};
  for (const ph of collectPlaceholders(doc)) {
    const bound = bindings[ph.key];
    data[ph.key] =
      overrides[ph.key] ??
      (bound !== undefined && bound !== ""
        ? valueToText(bound)
        : (fallbackFields[ph.key] ?? ""));
    log?.(`placeholder "${ph.key}" (${ph.kind}) = ${data[ph.key] || "(empty)"}`);
  }
  return data;
}

export async function renderTemplateToStorage(
  template: Template,
  data: PlaceholderData,
): Promise<string[]> {
  const pngs = await renderDocPages(template.doc, data);
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

  return renderUrls;
}
