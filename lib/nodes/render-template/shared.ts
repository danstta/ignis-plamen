import { db } from "@/lib/db";
import { renderJobs, type Template } from "@/lib/db/schema";
import { renderDocPages } from "@/lib/render/renderer";
import { storage } from "@/lib/storage";
import {
  collectPlaceholders,
  isPlaceholderImageValue,
  placeholderValueToText,
  type PlaceholderData,
  type PlaceholderValue,
} from "@/lib/editor/types";
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
  overrides?: Record<string, PlaceholderValue>;
  log?: (message: string) => void;
}): PlaceholderData {
  const data: PlaceholderData = {};
  for (const ph of collectPlaceholders(doc)) {
    const hasOverride = Object.hasOwn(overrides, ph.key);
    const override = hasOverride ? overrides[ph.key] : undefined;
    const bound = bindings[ph.key];
    if (ph.kind === "image") {
      data[ph.key] =
        override ??
        (isPlaceholderImageValue(bound)
          ? bound
          : bound !== undefined && bound !== ""
            ? valueToText(bound)
            : (fallbackFields[ph.key] ?? ""));
    } else {
      data[ph.key] =
        override !== undefined
          ? placeholderValueToText(override)
          : bound !== undefined && bound !== ""
            ? valueToText(bound)
            : (fallbackFields[ph.key] ?? "");
    }
    const preview = placeholderValueToText(data[ph.key]);
    log?.(`placeholder "${ph.key}" (${ph.kind}) = ${preview || "(empty)"}`);
  }
  return data;
}

export async function renderTemplateToStorage(
  template: Template,
  data: PlaceholderData,
): Promise<string[]> {
  const pngs = await renderDocPages(template.doc, data);
  const input = placeholderDataToTextRecord(data);
  const renderUrls: string[] = [];

  for (const png of pngs) {
    const key = `renders/${crypto.randomUUID()}.png`;
    const { url } = await storage().put(key, png, "image/png");
    renderUrls.push(url);
    await db().insert(renderJobs).values({
      templateId: template.id,
      input,
      outputUrl: url,
      status: "success",
    });
  }

  return renderUrls;
}

function placeholderDataToTextRecord(data: PlaceholderData): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      placeholderValueToText(value),
    ]),
  );
}
