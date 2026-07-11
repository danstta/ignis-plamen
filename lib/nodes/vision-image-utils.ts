import { isImageContentType } from "@/lib/images/content-types";
import {
  convertImageToJpeg,
  inferImageContentType,
} from "@/lib/images/normalize";
import type { ImageCandidate, NodeStepRunner } from "./types";

export type ProviderName = "OpenAI" | "Azure";

export type ChatMessages = (
  | { role: "system"; content: string }
  | { role: "user"; content: unknown[] }
)[];

export type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: unknown;
  };
};

export type PreparedImage = {
  candidate: ImageCandidate;
  sourceIndex: number;
  visionUrl: string;
};

export type SkippedPreparedImage = {
  candidate: ImageCandidate;
  sourceIndex: number;
  reason: string;
};

export type PreparedImagesResult = {
  preparedImages: PreparedImage[];
  skipped: SkippedPreparedImage[];
};

export type LogFn = (message: string) => void | Promise<void>;
export type CheckpointFn = () => Promise<void>;

const IMAGE_FETCH_USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
const MAX_PROVIDER_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const IMAGE_PREPARE_TIMEOUT_MS = 30_000;
const IMAGE_CONVERSION_TIMEOUT_MS = 20_000;
const CHAT_COMPLETION_TIMEOUT_MS = 45_000;
const IMAGE_FETCH_CONCURRENCY = 3;
const PROVIDER_SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const noopCheckpoint: CheckpointFn = async () => {};

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function jsonSchemaResponseFormat(
  name: string,
  schema: unknown,
): ResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

export async function writeLog(log: LogFn, message: string) {
  await log(message);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function compactReason(reason: string, maxLength = 500): string {
  const compact = reason.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 3)}...`
    : compact;
}

export function imageLogLabel(
  candidate: ImageCandidate,
  sourceIndex: number,
): string {
  const label = candidate.name ?? candidate.title ?? candidate.source;
  return label ? `image ${sourceIndex + 1} (${label})` : `image ${sourceIndex + 1}`;
}

export function urlForLog(candidate: ImageCandidate): string {
  return candidate.url.length > 160
    ? `${candidate.url.slice(0, 157)}...`
    : candidate.url;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await mapper(items[index], index);
      }
    }),
  );
  return results;
}

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new RequestTimeoutError(
          `${label} timed out after ${Math.round(timeoutMs / 1000)}s`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    clearTimeout(timeout!);
  }
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new RequestTimeoutError(
        `${label} timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDataUrl(url: string): { bytes: Buffer; contentType: string } {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) throw new Error("invalid data URL");

  const payload = decodeURIComponent(match[3]);
  return {
    contentType: match[1].toLowerCase(),
    bytes: Buffer.from(payload, match[2] ? "base64" : "utf8"),
  };
}

async function fetchImageBytes(
  candidate: ImageCandidate,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (candidate.url.startsWith("data:")) {
    const parsed = parseDataUrl(candidate.url);
    if (parsed.bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
      throw new Error(`image is ${parsed.bytes.byteLength} bytes`);
    }
    return parsed;
  }

  if (!/^https?:\/\//i.test(candidate.url)) {
    throw new Error(
      `unsupported image URL scheme: ${candidate.url.slice(0, 40)}`,
    );
  }

  const res = await fetchWithTimeout(
    candidate.url,
    {
      headers: {
        Accept: "image/*",
        "User-Agent": IMAGE_FETCH_USER_AGENT,
      },
    },
    IMAGE_FETCH_TIMEOUT_MS,
    "image fetch",
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error(`image is ${contentLength} bytes`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error(`image is ${bytes.byteLength} bytes`);
  }

  const headerContentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  const contentType =
    inferImageContentType({
      bytes,
      contentType: headerContentType,
      name: candidate.name ?? candidate.title,
    }) ||
    inferImageContentType({
      bytes,
      contentType: candidate.mimeType,
      name: candidate.name ?? candidate.title,
    });

  if (!isImageContentType(contentType)) {
    const declaredType = candidate.mimeType || headerContentType || "unknown";
    throw new Error(`expected image content-type, got "${declaredType}"`);
  }

  return { bytes, contentType };
}

function imageDataUrl(bytes: Buffer, contentType: string): string {
  const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
  return `data:${normalizedType};base64,${bytes.toString("base64")}`;
}

function highResolutionThumbnailUrl(candidate: ImageCandidate): string | undefined {
  const thumbnailLink = candidate.thumbnailLink?.trim();
  if (!thumbnailLink) return undefined;
  return thumbnailLink.replace(/=s\d+$/, "=s2048");
}

async function previewToDataUrl(
  candidate: ImageCandidate,
  sourceIndex: number,
  log: LogFn,
): Promise<string | undefined> {
  const previewUrl = highResolutionThumbnailUrl(candidate);
  if (!previewUrl) return undefined;

  const preview = await fetchImageBytes({ ...candidate, url: previewUrl });
  if (!PROVIDER_SUPPORTED_IMAGE_TYPES.has(preview.contentType)) {
    throw new Error(`preview has unsupported content-type ${preview.contentType}`);
  }

  await writeLog(
    log,
    `Using Drive preview for image ${sourceIndex + 1} because the original could not be sent directly.`,
  );
  return imageDataUrl(preview.bytes, preview.contentType);
}

async function providerImageToDataUrl(
  candidate: ImageCandidate,
  sourceIndex: number,
  log: LogFn,
  purpose: string,
): Promise<string> {
  let image: { bytes: Buffer; contentType: string };
  try {
    image = await fetchImageBytes(candidate);
  } catch (err) {
    const preview = await previewToDataUrl(candidate, sourceIndex, log);
    if (preview) return preview;
    throw err;
  }

  if (PROVIDER_SUPPORTED_IMAGE_TYPES.has(image.contentType)) {
    return imageDataUrl(image.bytes, image.contentType);
  }

  const preview = await previewToDataUrl(candidate, sourceIndex, log);
  if (preview) return preview;

  try {
    await writeLog(
      log,
      `Converting ${imageLogLabel(candidate, sourceIndex)} from ${image.contentType} to image/jpeg for ${purpose}.`,
    );
    const converted = await convertImageToJpeg(image.bytes, {
      quality: 90,
      maxBytes: MAX_PROVIDER_IMAGE_BYTES,
      timeoutMs: IMAGE_CONVERSION_TIMEOUT_MS,
    });
    await writeLog(
      log,
      `Converted image ${sourceIndex + 1} from ${image.contentType} to image/jpeg for ${purpose}.`,
    );
    return imageDataUrl(converted, "image/jpeg");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `unsupported image content-type ${image.contentType}; conversion failed: ${reason}`,
    );
  }
}

async function prepareProviderImage(input: {
  candidate: ImageCandidate;
  sourceIndex: number;
  purpose: string;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<
  | { prepared: PreparedImage; skipped?: never }
  | { prepared?: never; skipped: SkippedPreparedImage }
> {
  await input.checkpoint();
  const label = imageLogLabel(input.candidate, input.sourceIndex);
  try {
    const visionUrl = await withTimeout(
      providerImageToDataUrl(
        input.candidate,
        input.sourceIndex,
        input.log,
        input.purpose,
      ),
      IMAGE_PREPARE_TIMEOUT_MS,
      `preparing ${label}`,
    );
    return {
      prepared: {
        candidate: input.candidate,
        sourceIndex: input.sourceIndex,
        visionUrl,
      },
    };
  } catch (err) {
    const reason = compactReason(err instanceof Error ? err.message : String(err));
    await writeLog(
      input.log,
      `Skipping ${label}: ${reason}. URL: ${urlForLog(input.candidate)}`,
    );
    return {
      skipped: {
        candidate: input.candidate,
        sourceIndex: input.sourceIndex,
        reason,
      },
    };
  }
}

export async function prepareProviderImages(input: {
  candidates: ImageCandidate[];
  purpose: string;
  log: LogFn;
  checkpoint: CheckpointFn;
  step?: NodeStepRunner;
}): Promise<PreparedImagesResult> {
  const results = await mapWithConcurrency(
    input.candidates,
    IMAGE_FETCH_CONCURRENCY,
    async (candidate, sourceIndex) => {
      const prepare = () =>
        prepareProviderImage({
          candidate,
          sourceIndex,
          purpose: input.purpose,
          log: input.log,
          checkpoint: input.checkpoint,
        });
      return input.step
        ? input.step(`prepare:${sourceIndex}`, prepare)
        : prepare();
    },
  );

  return {
    preparedImages: results.flatMap((result) =>
      result.prepared ? [result.prepared] : [],
    ),
    skipped: results.flatMap((result) =>
      result.skipped ? [result.skipped] : [],
    ),
  };
}

export async function prepareProviderImagesLegacy(input: {
  candidates: ImageCandidate[];
  purpose: string;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<PreparedImage[]> {
  return (
    await prepareProviderImages({
      candidates: input.candidates,
      purpose: input.purpose,
      log: input.log,
      checkpoint: input.checkpoint,
    })
  ).preparedImages;
}

export function visionImageContentItems(images: PreparedImage[]): unknown[] {
  const content: unknown[] = [];

  for (const [localIndex, image] of images.entries()) {
    const metadata = [
      image.candidate.title ? `title: ${image.candidate.title}` : "",
      image.candidate.source ? `source: ${image.candidate.source}` : "",
      image.candidate.widthPx && image.candidate.heightPx
        ? `size: ${image.candidate.widthPx}x${image.candidate.heightPx}`
        : "",
    ]
      .filter(Boolean)
      .join(", ");

    content.push({
      type: "text",
      text: `Image index ${localIndex}${metadata ? ` (${metadata})` : ""}:`,
    });
    content.push({
      type: "image_url",
      image_url: { url: image.visionUrl },
    });
  }

  return content;
}

function parseAssistantJson<T>(text: string, provider: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]) as T;
    throw new Error(`${provider} returned invalid JSON: ${text.slice(0, 500)}`);
  }
}

export async function parseJsonResponse<T>(
  res: Response,
  provider: string,
): Promise<T> {
  const body = await res.text();
  if (!res.ok) {
    throw new ProviderRequestError(
      `${provider} ${res.status}: ${body}`,
      provider,
      res.status,
      body,
    );
  }

  const json = JSON.parse(body) as {
    choices?: { message?: { content?: string | unknown[] } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "{}";
  return parseAssistantJson<T>(text, provider);
}

function openAIHeaders(config: Record<string, unknown>) {
  const apiKey = String(config.apiKey ?? "").trim();
  if (!apiKey) throw new Error("OpenAI connection is missing an API key.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const organizationId = String(config.organizationId ?? "").trim();
  const projectId = String(config.projectId ?? "").trim();
  if (organizationId) headers["OpenAI-Organization"] = organizationId;
  if (projectId) headers["OpenAI-Project"] = projectId;
  return headers;
}

export async function sendOpenAIChatCompletion(input: {
  config: Record<string, unknown>;
  model: string;
  messages: ChatMessages;
  responseFormat: ResponseFormat;
}): Promise<Response> {
  return fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: openAIHeaders(input.config),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        response_format: input.responseFormat,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "OpenAI chat completion",
  );
}

export async function sendAzureChatCompletion(input: {
  config: Record<string, unknown>;
  deploymentName: string;
  messages: ChatMessages;
  responseFormat: ResponseFormat;
}): Promise<Response> {
  const endpoint = String(input.config.endpoint ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(input.config.apiKey ?? "").trim();
  const configuredApiVersion = String(input.config.apiVersion ?? "").trim();

  if (!endpoint) throw new Error("Azure connection is missing an endpoint.");
  if (!apiKey) throw new Error("Azure connection is missing an API key.");
  if (!input.deploymentName) {
    throw new Error("Azure connection is missing a deployment name.");
  }

  const usesUnifiedV1Endpoint = /\/openai\/v1$/i.test(endpoint);
  const url = new URL(
    usesUnifiedV1Endpoint
      ? `${endpoint}/chat/completions`
      : `${endpoint}/openai/deployments/${encodeURIComponent(input.deploymentName)}/chat/completions`,
  );
  if (!usesUnifiedV1Endpoint) {
    url.searchParams.set(
      "api-version",
      configuredApiVersion || "2025-01-01-preview",
    );
  }

  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        ...(usesUnifiedV1Endpoint ? { model: input.deploymentName } : {}),
        messages: input.messages,
        response_format: input.responseFormat,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "Azure chat completion",
  );
}

export function isAzureContentPolicyViolation(err: unknown): boolean {
  if (err instanceof ProviderRequestError) {
    if (err.provider !== "Azure") return false;
    const body = err.body.toLowerCase();
    return (
      err.status === 400 &&
      (body.includes("content_policy_violation") ||
        body.includes("content safety system"))
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  const body = message.toLowerCase();
  return (
    body.includes("azure 400") &&
    (body.includes("content_policy_violation") ||
      body.includes("content safety system"))
  );
}

export function shouldSplitProviderError(err: unknown): boolean {
  if (!(err instanceof ProviderRequestError)) return false;
  const body = err.body.toLowerCase();
  return (
    err.status === 413 ||
    body.includes("too many image") ||
    body.includes("too large") ||
    body.includes("payload") ||
    body.includes("maximum context") ||
    body.includes("context length")
  );
}
