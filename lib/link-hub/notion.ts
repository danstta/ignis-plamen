import { createHmac, timingSafeEqual } from "node:crypto";
import {
  notionLinkHubCallDeadlineProperty,
  notionLinkHubDataSourceId,
  notionLinkHubGoogleFormLinkProperty,
  notionLinkHubInfopackLinkProperty,
  notionLinkHubProjectCountryProperty,
  notionLinkHubProjectNameProperty,
  notionLinkHubShowOnLinksProperty,
  notionLinkHubSortOrderProperty,
  notionLinkHubToken,
} from "@/lib/env";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const REQUEST_TIMEOUT_MS = 15_000;

type JsonRecord = Record<string, unknown>;

type NotionTextItem = {
  plain_text?: string;
  text?: { content?: string };
};

type NotionProperty = JsonRecord & {
  type?: string;
};

export type NotionPage = JsonRecord & {
  id: string;
  object?: string;
  archived?: boolean;
  in_trash?: boolean;
  parent?: JsonRecord;
  properties?: Record<string, NotionProperty>;
};

export type LinkHubProjectUpsert = {
  notion_page_id: string;
  project_name: string;
  infopack_link: string | null;
  google_form_link: string | null;
  project_country: string | null;
  show_on_links: boolean;
  call_deadline: string | null;
  sort_order: number | null;
  updated_at: string;
};

export type LinkHubPropertyKey =
  | "projectName"
  | "infopackLink"
  | "googleFormLink"
  | "projectCountry"
  | "showOnLinks"
  | "callDeadline"
  | "sortOrder";

export type LinkHubPropertyNames = Partial<Record<LinkHubPropertyKey, string>>;
export type LinkHubPropertyValues = Partial<Record<LinkHubPropertyKey, unknown>>;

const PROPERTY_FALLBACKS: Record<LinkHubPropertyKey, string[]> = {
  projectName: ["Ime projekta", "Project name", "project_name", "Name", "Title"],
  infopackLink: ["Infopack link", "infopack_link", "Infopack"],
  googleFormLink: [
    "Forma link",
    "Google form link",
    "google_form_link",
    "Application form",
  ],
  projectCountry: [
    "Država",
    "Drzava",
    "DrÅ¾ava",
    "Project country",
    "project_country",
    "Country",
  ],
  showOnLinks: [
    "Show on links",
    "show_on_links",
    "Show on Links",
    "Show on /links",
    "Visible on links",
  ],
  callDeadline: ["Rok poziva", "call_deadline", "Call deadline", "Deadline"],
  sortOrder: ["Sort order", "sort_order", "Order"],
};

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function propertyName(key: LinkHubPropertyKey, names?: LinkHubPropertyNames): string {
  const configured = names?.[key]?.trim();
  if (configured) return configured;

  switch (key) {
    case "projectName":
      return notionLinkHubProjectNameProperty();
    case "infopackLink":
      return notionLinkHubInfopackLinkProperty();
    case "googleFormLink":
      return notionLinkHubGoogleFormLinkProperty();
    case "projectCountry":
      return notionLinkHubProjectCountryProperty();
    case "showOnLinks":
      return notionLinkHubShowOnLinksProperty();
    case "callDeadline":
      return notionLinkHubCallDeadlineProperty();
    case "sortOrder":
      return notionLinkHubSortOrderProperty();
  }
}

function propertyCandidates(
  key: LinkHubPropertyKey,
  names?: LinkHubPropertyNames,
): string[] {
  return [...new Set([propertyName(key, names), ...PROPERTY_FALLBACKS[key]])]
    .filter(Boolean);
}

function normalizePropertyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getProperty(
  properties: Record<string, NotionProperty> | undefined,
  key: LinkHubPropertyKey,
  names?: LinkHubPropertyNames,
): NotionProperty | undefined {
  if (!properties) return undefined;
  const candidates = propertyCandidates(key, names);
  for (const candidate of candidates) {
    const exact = properties[candidate];
    if (exact) return exact;
  }

  const normalizedCandidates = new Set(candidates.map(normalizePropertyName));
  for (const [name, property] of Object.entries(properties)) {
    if (normalizedCandidates.has(normalizePropertyName(name))) {
      return property;
    }
  }
  return undefined;
}

function textItemsToString(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const record = asRecord(item) as NotionTextItem | null;
      return record?.plain_text ?? record?.text?.content ?? "";
    })
    .join("")
    .trim();
}

function formulaToString(value: unknown): string {
  const formula = asRecord(value);
  if (!formula) return "";
  switch (formula.type) {
    case "string":
      return stringValue(formula.string) ?? "";
    case "number":
      return typeof formula.number === "number" ? String(formula.number) : "";
    case "boolean":
      return typeof formula.boolean === "boolean" ? String(formula.boolean) : "";
    case "date": {
      const date = asRecord(formula.date);
      return stringValue(date?.start) ?? stringValue(date?.end) ?? "";
    }
    default:
      return "";
  }
}

function rollupToString(value: unknown): string {
  const rollup = asRecord(value);
  if (!rollup) return "";
  switch (rollup.type) {
    case "array":
      return Array.isArray(rollup.array)
        ? rollup.array
            .map((item) => propertyToString(item))
            .filter(Boolean)
            .join(", ")
        : "";
    case "number":
      return typeof rollup.number === "number" ? String(rollup.number) : "";
    case "date": {
      const date = asRecord(rollup.date);
      return stringValue(date?.start) ?? stringValue(date?.end) ?? "";
    }
    default:
      return "";
  }
}

function propertyToString(property: unknown): string {
  const record = asRecord(property);
  if (!record) return "";

  switch (record.type) {
    case "title":
      return textItemsToString(record.title);
    case "rich_text":
      return textItemsToString(record.rich_text);
    case "url":
      return stringValue(record.url) ?? "";
    case "select": {
      const select = asRecord(record.select);
      return stringValue(select?.name) ?? "";
    }
    case "multi_select":
      return Array.isArray(record.multi_select)
        ? record.multi_select
            .map((item) => stringValue(asRecord(item)?.name))
            .filter(Boolean)
            .join(", ")
        : "";
    case "status": {
      const status = asRecord(record.status);
      return stringValue(status?.name) ?? "";
    }
    case "number":
      return typeof record.number === "number" ? String(record.number) : "";
    case "checkbox":
      return typeof record.checkbox === "boolean" ? String(record.checkbox) : "";
    case "date": {
      const date = asRecord(record.date);
      return stringValue(date?.start) ?? stringValue(date?.end) ?? "";
    }
    case "email":
      return stringValue(record.email) ?? "";
    case "phone_number":
      return stringValue(record.phone_number) ?? "";
    case "formula":
      return formulaToString(record.formula);
    case "rollup":
      return rollupToString(record.rollup);
    default:
      return "";
  }
}

function propertyToBoolean(property: NotionProperty | undefined): boolean {
  if (!property) return false;
  if (property.type === "checkbox") {
    return property.checkbox === true;
  }
  return valueToBoolean(property);
}

function propertyToDateOnly(property: NotionProperty | undefined): string | null {
  if (!property || property.type !== "date") return null;
  const date = asRecord(property.date);
  const value = stringValue(date?.end) ?? stringValue(date?.start);
  return value ? value.slice(0, 10) : null;
}

function propertyToNumber(property: NotionProperty | undefined): number | null {
  if (!property) return null;
  if (property.type === "number") {
    return typeof property.number === "number" ? property.number : null;
  }
  const value = Number(propertyToString(property));
  return Number.isFinite(value) ? value : null;
}

function propertyToHttpUrl(property: NotionProperty | undefined): string | null {
  const value = propertyToString(property);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(valueToString).filter(Boolean).join(", ");
  }

  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.type === "string") return propertyToString(record);

  return (
    stringValue(record.value) ??
    stringValue(record.name) ??
    stringValue(record.text) ??
    stringValue(record.title) ??
    ""
  );
}

function valueToBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = valueToString(value).toLowerCase();
  return ["1", "true", "yes", "y", "on", "checked"].includes(text);
}

function valueToDateOnly(value: unknown): string | null {
  const record = asRecord(value);
  if (record?.type === "date") return propertyToDateOnly(record);
  if (record?.date) {
    const date = asRecord(record.date);
    const dateValue = stringValue(date?.end) ?? stringValue(date?.start);
    return dateValue ? dateValue.slice(0, 10) : null;
  }
  const dateValue = stringValue(record?.end) ?? stringValue(record?.start);
  if (dateValue) return dateValue.slice(0, 10);
  const text = valueToString(value);
  return text ? text.slice(0, 10) : null;
}

function valueToNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const number = Number(valueToString(value));
  return Number.isFinite(number) ? number : null;
}

function valueToHttpUrl(value: unknown): string | null {
  const text = valueToString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function extractNotionId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.trim().replace(/-/g, "");
  const match = compact.match(/[0-9a-f]{32}/i);
  return match?.[0]?.toLowerCase() ?? value.trim();
}

export function notionIdsEqual(a: string | undefined, b: string | undefined): boolean {
  const left = extractNotionId(a);
  const right = extractNotionId(b);
  return Boolean(left && right && left === right);
}

function configuredDataSourceId(): string | undefined {
  return extractNotionId(notionLinkHubDataSourceId());
}

export function pageBelongsToConfiguredDataSource(page: NotionPage): boolean {
  const configured = configuredDataSourceId();
  if (!configured) return true;

  const parent = asRecord(page.parent);
  const parentId =
    stringValue(parent?.data_source_id) ??
    stringValue(parent?.database_id) ??
    stringValue(parent?.id);

  return notionIdsEqual(parentId, configured);
}

export function mapNotionPageToLinkHubProject(
  page: NotionPage,
  now = new Date(),
  names?: LinkHubPropertyNames,
): LinkHubProjectUpsert {
  const properties = page.properties;
  const projectName = propertyToString(
    getProperty(properties, "projectName", names),
  );
  const archived = page.archived === true || page.in_trash === true;
  const showOnLinks =
    !archived &&
    projectName.length > 0 &&
    propertyToBoolean(getProperty(properties, "showOnLinks", names));

  return {
    notion_page_id: extractNotionId(page.id) ?? page.id,
    project_name: projectName,
    infopack_link: propertyToHttpUrl(
      getProperty(properties, "infopackLink", names),
    ),
    google_form_link: propertyToHttpUrl(
      getProperty(properties, "googleFormLink", names),
    ),
    project_country:
      propertyToString(getProperty(properties, "projectCountry", names)) || null,
    show_on_links: showOnLinks,
    call_deadline: propertyToDateOnly(
      getProperty(properties, "callDeadline", names),
    ),
    sort_order: propertyToNumber(getProperty(properties, "sortOrder", names)),
    updated_at: now.toISOString(),
  };
}

function payloadRecord(payload: unknown): JsonRecord | null {
  const root = asRecord(payload);
  if (!root) return null;
  return asRecord(root.body) ?? asRecord(root.payload) ?? root;
}

function payloadProperties(payload: JsonRecord): JsonRecord | null {
  return (
    asRecord(payload.properties) ??
    asRecord(asRecord(payload.data)?.properties) ??
    asRecord(asRecord(payload.page)?.properties) ??
    asRecord(asRecord(payload.notion_page)?.properties)
  );
}

function directCandidates(
  key: LinkHubPropertyKey,
  names?: LinkHubPropertyNames,
): string[] {
  const camelByKey: Record<LinkHubPropertyKey, string[]> = {
    projectName: ["projectName"],
    infopackLink: ["infopackLink"],
    googleFormLink: ["googleFormLink"],
    projectCountry: ["projectCountry"],
    showOnLinks: ["showOnLinks"],
    callDeadline: ["callDeadline", "rokPoziva"],
    sortOrder: ["sortOrder"],
  };
  return [...propertyCandidates(key, names), ...camelByKey[key]];
}

function payloadValue(
  payload: JsonRecord,
  properties: JsonRecord | null,
  key: LinkHubPropertyKey,
  names?: LinkHubPropertyNames,
  values?: LinkHubPropertyValues,
): unknown {
  if (values && Object.hasOwn(values, key) && values[key] !== undefined) {
    return values[key];
  }

  for (const candidate of directCandidates(key, names)) {
    if (Object.hasOwn(payload, candidate)) return payload[candidate];
    if (properties && Object.hasOwn(properties, candidate)) {
      return properties[candidate];
    }
  }

  const normalized = new Set(
    directCandidates(key, names).map(normalizePropertyName),
  );
  for (const [name, value] of Object.entries(payload)) {
    if (normalized.has(normalizePropertyName(name))) return value;
  }
  for (const [name, value] of Object.entries(properties ?? {})) {
    if (normalized.has(normalizePropertyName(name))) return value;
  }

  return undefined;
}

function payloadPageId(payload: JsonRecord): string | undefined {
  const candidates = [
    payload.notion_page_id,
    payload.notionPageId,
    payload.page_id,
    payload.pageId,
    payload.id,
    asRecord(payload.page)?.id,
    asRecord(payload.notion_page)?.id,
    asRecord(payload.data)?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return extractNotionId(candidate);
  }
  return undefined;
}

function hasKnownLinkHubField(
  payload: JsonRecord,
  properties: JsonRecord | null,
  names?: LinkHubPropertyNames,
  values?: LinkHubPropertyValues,
): boolean {
  return (
    ([
      "projectName",
      "infopackLink",
      "googleFormLink",
      "projectCountry",
      "showOnLinks",
      "callDeadline",
      "sortOrder",
    ] as LinkHubPropertyKey[]).some(
      (key) => payloadValue(payload, properties, key, names, values) !== undefined,
    )
  );
}

export function mapLinkHubPayloadToProject(
  payload: unknown,
  now = new Date(),
  names?: LinkHubPropertyNames,
  values?: LinkHubPropertyValues,
): LinkHubProjectUpsert | null {
  const source = payloadRecord(payload);
  if (!source) return null;

  const properties = payloadProperties(source);
  const notionPageId = payloadPageId(source);
  if (!notionPageId || !hasKnownLinkHubField(source, properties, names, values)) {
    return null;
  }

  const projectName = valueToString(
    payloadValue(source, properties, "projectName", names, values),
  );
  const archived = valueToBoolean(source.archived) || valueToBoolean(source.in_trash);

  return {
    notion_page_id: notionPageId,
    project_name: projectName,
    infopack_link: valueToHttpUrl(
      payloadValue(source, properties, "infopackLink", names, values),
    ),
    google_form_link: valueToHttpUrl(
      payloadValue(source, properties, "googleFormLink", names, values),
    ),
    project_country:
      valueToString(
        payloadValue(source, properties, "projectCountry", names, values),
      ) ||
      null,
    show_on_links:
      !archived &&
      valueToBoolean(payloadValue(source, properties, "showOnLinks", names, values)),
    call_deadline: valueToDateOnly(
      payloadValue(source, properties, "callDeadline", names, values),
    ),
    sort_order: valueToNumber(
      payloadValue(source, properties, "sortOrder", names, values),
    ),
    updated_at: now.toISOString(),
  };
}

function notionToken(): string {
  const token = notionLinkHubToken();
  if (!token) {
    throw new Error("Missing NOTION_LINK_HUB_TOKEN.");
  }
  return token;
}

async function notionRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as JsonRecord | null;
  if (!response.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : `${response.status} ${response.statusText}`;
    throw new Error(`Notion request failed for ${path}: ${message}`);
  }
  return body as T;
}

export async function retrieveNotionPage(
  pageId: string,
): Promise<NotionPage | null> {
  try {
    return await notionRequest<NotionPage>(
      `/pages/${encodeURIComponent(extractNotionId(pageId) ?? pageId)}`,
      { method: "GET" },
    );
  } catch (err) {
    if (
      err instanceof Error &&
      /\b404\b|not found|could not find/i.test(err.message)
    ) {
      return null;
    }
    throw err;
  }
}

type QueryDataSourceResponse = {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
};

export async function queryLinkHubNotionPages(): Promise<NotionPage[]> {
  const dataSourceId = configuredDataSourceId();
  if (!dataSourceId) {
    throw new Error("Missing NOTION_LINK_HUB_DATA_SOURCE_ID.");
  }

  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await notionRequest<QueryDataSourceResponse>(
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );

    for (const result of response.results ?? []) {
      const page = asRecord(result) as NotionPage | null;
      if (page?.object === "page" && typeof page.id === "string") {
        pages.push(page);
      }
    }

    cursor =
      response.has_more && typeof response.next_cursor === "string"
        ? response.next_cursor
        : undefined;
  } while (cursor);

  return pages;
}

export function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyNotionWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  verificationToken: string,
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", verificationToken).update(rawBody).digest("hex");
  return timingSafeEqualText(signatureHeader.trim(), expected);
}

function findTypedEntityId(
  value: unknown,
  type: "page" | "data_source",
): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const object = stringValue(record.object);
  const entityType = stringValue(record.type);
  if ((object === type || entityType === type) && typeof record.id === "string") {
    return record.id;
  }

  const entity = asRecord(record.entity);
  const entityId = findTypedEntityId(entity, type);
  if (entityId) return entityId;

  const data = asRecord(record.data);
  const dataEntityId = findTypedEntityId(data?.entity, type);
  if (dataEntityId) return dataEntityId;

  return undefined;
}

function findDeepStringKey(
  value: unknown,
  keys: Set<string>,
  depth = 0,
): string | undefined {
  if (depth > 5) return undefined;
  const record = asRecord(value);
  if (!record) return undefined;

  for (const [key, child] of Object.entries(record)) {
    if (keys.has(key) && typeof child === "string") return child;
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findDeepStringKey(item, keys, depth + 1);
        if (found) return found;
      }
      continue;
    }
    const found = findDeepStringKey(child, keys, depth + 1);
    if (found) return found;
  }

  return undefined;
}

export type NotionWebhookSignal = {
  eventType: string | null;
  verificationToken: string | null;
  pageId: string | null;
  dataSourceId: string | null;
  requiresFullSync: boolean;
};

export function readNotionWebhookSignal(body: unknown): NotionWebhookSignal {
  const record = asRecord(body);
  const eventType =
    stringValue(record?.type) ?? stringValue(record?.event_type) ?? null;
  const pageId =
    extractNotionId(findTypedEntityId(body, "page")) ??
    extractNotionId(
      findDeepStringKey(body, new Set(["page_id", "pageId", "notion_page_id"])),
    ) ??
    null;
  const dataSourceId =
    extractNotionId(findTypedEntityId(body, "data_source")) ??
    extractNotionId(
      findDeepStringKey(body, new Set(["data_source_id", "dataSourceId"])),
    ) ??
    null;
  const lowerType = eventType?.toLowerCase() ?? "";

  return {
    eventType,
    verificationToken: stringValue(record?.verification_token) ?? null,
    pageId,
    dataSourceId,
    requiresFullSync:
      !pageId ||
      lowerType.startsWith("database.") ||
      lowerType.startsWith("data_source."),
  };
}

export function signalMatchesConfiguredDataSource(
  signal: Pick<NotionWebhookSignal, "dataSourceId">,
): boolean {
  const configured = configuredDataSourceId();
  if (!configured || !signal.dataSourceId) return true;
  return notionIdsEqual(signal.dataSourceId, configured);
}
