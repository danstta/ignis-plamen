import { getConnection } from "@/lib/connections/service";
import { valueToText } from "@/lib/workflows/references";
import type { NodeDefinition } from "@/lib/nodes/types";
import {
  notionUpdatePageMeta,
  type NotionPropertyType,
  type NotionPropertyUpdate,
  type NotionUpdatePageConfig,
} from "./meta";

const NOTION_API_VERSION = "2022-06-28";

function cleanPageId(pageId: string): string {
  return pageId.trim().replace(/-/g, "");
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function nonEmptyText(value: unknown): string {
  return valueToText(value).trim();
}

function nullableText(value: unknown): string | null {
  const text = nonEmptyText(value);
  return text ? text : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "checked"].includes(text);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) {
    throw new Error(`Notion number value is invalid: ${valueToText(value)}`);
  }
  return number;
}

function toNameList(value: unknown): { name: string }[] {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((part) => part.trim());
  return raw
    .map((item) => nonEmptyText(item))
    .filter(Boolean)
    .map((name) => ({ name }));
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : "File";
  } catch {
    return "File";
  }
}

function toExternalFiles(value: unknown) {
  return asArray(value)
    .flatMap((item) =>
      typeof item === "string"
        ? item.split(",").map((part) => part.trim())
        : [nonEmptyText(item)],
    )
    .filter(Boolean)
    .map((url) => ({
      name: fileNameFromUrl(url),
      type: "external" as const,
      external: { url },
    }));
}

function notionPropertyValue(type: NotionPropertyType, value: unknown): unknown {
  const text = valueToText(value);
  switch (type) {
    case "title":
      return { title: text ? [{ text: { content: text } }] : [] };
    case "rich_text":
      return { rich_text: text ? [{ text: { content: text } }] : [] };
    case "number":
      return { number: toNumber(value) };
    case "checkbox":
      return { checkbox: toBoolean(value) };
    case "select": {
      const name = nullableText(value);
      return { select: name ? { name } : null };
    }
    case "multi_select":
      return { multi_select: toNameList(value) };
    case "status": {
      const name = nullableText(value);
      return { status: name ? { name } : null };
    }
    case "date": {
      const start = nullableText(value);
      return { date: start ? { start } : null };
    }
    case "url":
      return { url: nullableText(value) };
    case "email":
      return { email: nullableText(value) };
    case "phone_number":
      return { phone_number: nullableText(value) };
    case "files":
      return { files: toExternalFiles(value) };
  }
}

function buildProperties(updates: NotionPropertyUpdate[]) {
  const properties: Record<string, unknown> = {};
  for (const update of updates) {
    const name = update.name.trim();
    if (!name) continue;
    properties[name] = notionPropertyValue(update.type, update.value);
  }
  return properties;
}

export const notionUpdatePageNode: NodeDefinition<NotionUpdatePageConfig> = {
  ...notionUpdatePageMeta,

  async run(ctx) {
    const pageId = cleanPageId(ctx.config.pageId);
    if (!pageId) throw new Error("Page ID is required");

    const properties = buildProperties(ctx.config.properties);
    if (Object.keys(properties).length === 0) {
      throw new Error("Add at least one Notion property update");
    }

    const connection = await getConnection(ctx.config.connectionId);
    if (!connection || connection.type !== "notion") {
      throw new Error("Select a valid Notion connection");
    }

    const token = String(connection.config?.integrationToken ?? "").trim();
    if (!token) throw new Error("Notion connection is missing an integration token");

    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
      },
      body: JSON.stringify({ properties }),
    });

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const message =
        typeof body?.message === "string"
          ? body.message
          : `${res.status} ${res.statusText}`;
      throw new Error(`Notion update failed: ${message}`);
    }

    await ctx.log(`updated ${Object.keys(properties).length} Notion property value(s)`);

    return {
      type: "output",
      outputs: {
        pageId,
        url: typeof body?.url === "string" ? body.url : "",
        page: body ?? {},
      },
    };
  },
};
