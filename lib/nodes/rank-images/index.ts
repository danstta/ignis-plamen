import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import { storage } from "@/lib/storage";
import type { ImageCandidate, NodeDefinition } from "../types";
import { rankImagesMeta, type RankImagesConfig } from "./meta";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ranking: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          score: { type: "number" },
          reason: { type: "string" },
        },
        required: ["index", "score", "reason"],
      },
    },
  },
  required: ["ranking"],
} as const;

const diverseSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    selection: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          reason: { type: "string" },
          rotationDegrees: { type: "integer", enum: [0, 90, 180, 270] },
        },
        required: ["index", "reason", "rotationDegrees"],
      },
    },
  },
  required: ["selection"],
} as const;

interface RankingEntry {
  index: number;
  score: number;
  reason: string;
}

type RotationDegrees = 0 | 90 | 180 | 270;

interface DiverseSelectionEntry {
  index: number;
  reason: string;
  rotationDegrees: RotationDegrees;
}

interface RankingResult {
  ranking: RankingEntry[];
  candidates: ImageCandidate[];
}

interface DiverseSelectionResult {
  selection: DiverseSelectionEntry[];
  candidates: ImageCandidate[];
}

interface SelectedCandidate {
  candidate: ImageCandidate;
  rotationDegrees: RotationDegrees;
}

interface PreparedProviderImage {
  candidate: ImageCandidate;
  visionUrl: string;
  sourceIndex: number;
}

interface ScoredPreparedImage {
  image: PreparedProviderImage;
  score: number;
  reason: string;
}

interface SelectedPreparedImage {
  image: PreparedProviderImage;
  reason: string;
  rotationDegrees: RotationDegrees;
}

type ChatMessages = { role: "user"; content: unknown[] }[];
type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: unknown;
  };
};

type LogFn = (message: string) => void | Promise<void>;
type CheckpointFn = () => Promise<void>;

const IMAGE_FETCH_USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
const MAX_CANDIDATES = 100;
const MAX_PROVIDER_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_NORMALIZED_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const CHAT_COMPLETION_TIMEOUT_MS = 45_000;
const AZURE_RANK_CHUNK_SIZE = 4;
const OPENAI_RANK_CHUNK_SIZE = 4;
const DIVERSITY_CHUNK_SIZE = 6;
const PROVIDER_CHUNK_CONCURRENCY = 8;
const IMAGE_FETCH_CONCURRENCY = 12;
const NORMALIZE_CONCURRENCY = 8;
const PROVIDER_SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const noopCheckpoint: CheckpointFn = async () => {};

class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isImageCandidate(value: unknown): value is ImageCandidate {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.trim() !== ""
  );
}

function normalizeCandidates(value: unknown): ImageCandidate[] {
  const raw = isRecord(value) && Array.isArray(value.candidates)
    ? value.candidates
    : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate): ImageCandidate[] => {
    if (isImageCandidate(candidate)) return [candidate];
    if (typeof candidate !== "string") return [];
    const url = candidate.trim();
    return url ? [{ url, attribution: "" }] : [];
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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

async function writeLog(log: LogFn, message: string) {
  await log(message);
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

function buildMessages(
  criteria: string,
  location: string,
  imageUrls: string[],
): ChatMessages {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Rank these ${imageUrls.length} candidate photos for the location "${location}".\n` +
        `Criteria: ${criteria}\n` +
        `Each image is given in order, index 0..${imageUrls.length - 1}. ` +
        `Return a ranking where a higher score is a better fit. Use a 0-100 score scale so scores remain comparable across separate batches.`,
    },
    ...imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  return [{ role: "user", content }];
}

function buildDiverseSelectionMessages(
  criteria: string,
  location: string,
  selectionCount: number,
  imageUrls: string[],
): ChatMessages {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Choose the final ${selectionCount} images for the location "${location}" ` +
        `from this already ranked candidate pool.\n` +
        `Original ranking criteria: ${criteria}\n\n` +
        `The images are given in pool order, index 0..${imageUrls.length - 1}. ` +
        `Return exactly ${Math.min(selectionCount, imageUrls.length)} selections when possible.\n\n` +
        `Selection rules:\n` +
        `- Prioritize image quality and fit, but do not simply pick the first images.\n` +
        `- The final selected set must be visually diverse.\n` +
        `- Avoid near-duplicates: same scene, same table, same group pose, same camera angle, same activity moment, or repeated burst shots.\n` +
        `- Prefer a balanced story across workshop activity, group/candid interaction, presentation, cultural/flag moment, and location/context when available.\n` +
        `- If a strong Serbian flag or Serbian cultural representation photo is available, include one if it does not make the set repetitive.\n` +
        `- Keep only the best image from a cluster of similar photos.\n` +
        `- For rotationDegrees, return the clockwise rotation needed to make the image upright. Use 0 if it already looks upright or if unsure.`,
    },
    ...imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  return [{ role: "user", content }];
}

const responseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "image_ranking",
    strict: true,
    schema: responseSchema,
  },
};

const diverseSelectionResponseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "diverse_image_selection",
    strict: true,
    schema: diverseSelectionSchema,
  },
};

function parseAssistantJson<T>(text: string, provider: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]) as T;
    throw new Error(`${provider} returned invalid JSON: ${text.slice(0, 500)}`);
  }
}

async function parseJsonResponse<T>(res: Response, provider: string): Promise<T> {
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

function isAzureContentPolicyViolation(err: unknown): boolean {
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

function shouldSplitProviderError(err: unknown): boolean {
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

async function parseRankingResponse(res: Response, provider: string) {
  const parsed = await parseJsonResponse<{ ranking?: RankingEntry[] }>(
    res,
    provider,
  );
  return Array.isArray(parsed.ranking) ? parsed.ranking : [];
}

async function parseDiverseSelectionResponse(res: Response, provider: string) {
  const parsed = await parseJsonResponse<{ selection?: DiverseSelectionEntry[] }>(
    res,
    provider,
  );
  return Array.isArray(parsed.selection) ? parsed.selection : [];
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

async function sendOpenAIChatCompletion(
  config: Record<string, unknown>,
  model: string,
  messages: ChatMessages,
  format: ResponseFormat,
): Promise<Response> {
  return fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: openAIHeaders(config),
      body: JSON.stringify({
        model,
        messages,
        response_format: format,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "OpenAI chat completion",
  );
}

async function sendAzureChatCompletion(
  config: Record<string, unknown>,
  deploymentName: string,
  messages: ChatMessages,
  format: ResponseFormat,
): Promise<Response> {
  const endpoint = String(config.endpoint ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(config.apiKey ?? "").trim();
  const configuredApiVersion = String(config.apiVersion ?? "").trim();

  if (!endpoint) throw new Error("Azure connection is missing an endpoint.");
  if (!apiKey) throw new Error("Azure connection is missing an API key.");
  if (!deploymentName) {
    throw new Error("Azure connection is missing a deployment name.");
  }

  const usesUnifiedV1Endpoint = /\/openai\/v1$/i.test(endpoint);
  const url = new URL(
    usesUnifiedV1Endpoint
      ? `${endpoint}/chat/completions`
      : `${endpoint}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`,
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
        ...(usesUnifiedV1Endpoint ? { model: deploymentName } : {}),
        messages,
        response_format: format,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "Azure chat completion",
  );
}

function parseDataUrl(url: string): { bytes: Buffer; contentType: string } {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) throw new Error("invalid data URL");
  return {
    contentType: match[1],
    bytes: Buffer.from(
      decodeURIComponent(match[3]),
      match[2] ? "base64" : "utf8",
    ),
  };
}

async function fetchImageBytes(
  candidate: ImageCandidate,
  maxBytes: number,
): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  if (candidate.url.startsWith("data:")) {
    const parsed = parseDataUrl(candidate.url);
    if (parsed.bytes.byteLength > maxBytes) {
      throw new Error(`image is ${parsed.bytes.byteLength} bytes`);
    }
    return parsed;
  }

  if (!/^https?:\/\//i.test(candidate.url)) {
    throw new Error(`unsupported image URL scheme: ${candidate.url.slice(0, 40)}`);
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

  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`expected image content-type, got "${contentType || "unknown"}"`);
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`image is ${contentLength} bytes`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error(`image is ${bytes.byteLength} bytes`);
  }

  return { bytes, contentType: contentType.toLowerCase() };
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

async function fallbackPreviewToDataUrl(
  candidate: ImageCandidate,
  sourceIndex: number,
  log: LogFn,
): Promise<string | undefined> {
  const previewUrl = highResolutionThumbnailUrl(candidate);
  if (!previewUrl) return undefined;

  const preview = await fetchImageBytes(
    { ...candidate, url: previewUrl },
    MAX_PROVIDER_IMAGE_BYTES,
  );
  if (!PROVIDER_SUPPORTED_IMAGE_TYPES.has(preview.contentType)) {
    throw new Error(`preview has unsupported content-type ${preview.contentType}`);
  }

  await writeLog(
    log,
    `Using JPEG preview for image candidate ${sourceIndex} because the original file is ${candidate.mimeType ?? "an unsupported image type"}.`,
  );
  return imageDataUrl(preview.bytes, preview.contentType);
}

async function providerImageToDataUrl(
  candidate: ImageCandidate,
  sourceIndex: number,
  log: LogFn,
): Promise<string> {
  const { bytes, contentType } = await fetchImageBytes(
    candidate,
    MAX_PROVIDER_IMAGE_BYTES,
  );
  if (PROVIDER_SUPPORTED_IMAGE_TYPES.has(contentType)) {
    return imageDataUrl(bytes, contentType);
  }

  const preview = await fallbackPreviewToDataUrl(candidate, sourceIndex, log);
  if (preview) return preview;

  let converted: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    converted = await sharp(bytes, { failOn: "none" })
      .autoOrient()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `unsupported image content-type ${contentType}; conversion failed: ${reason}`,
    );
  }

  if (converted.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error(
      `converted image is ${converted.byteLength} bytes`,
    );
  }

  await writeLog(
    log,
    `Converted image candidate ${sourceIndex} from ${contentType} to image/jpeg for ${MAX_PROVIDER_IMAGE_BYTES / 1024 / 1024}MB vision upload compatibility.`,
  );
  return imageDataUrl(converted, "image/jpeg");
}

async function prepareProviderImages(
  candidates: ImageCandidate[],
  provider: "OpenAI" | "Azure",
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<PreparedProviderImage[]> {
  const prepared = await mapWithConcurrency(
    candidates,
    IMAGE_FETCH_CONCURRENCY,
    async (candidate, sourceIndex) => {
      await checkpoint();
      try {
        return {
          candidate,
          visionUrl: await providerImageToDataUrl(candidate, sourceIndex, log),
          sourceIndex,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await writeLog(
          log,
          `Skipping image candidate ${sourceIndex} because it could not be prepared for ${provider}: ${reason}`,
        );
        return null;
      }
    },
  );
  return prepared.filter((image): image is PreparedProviderImage => Boolean(image));
}

function sanitizeScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function sanitizeRotation(value: unknown): RotationDegrees {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

function normalizeRankingEntries(
  entries: RankingEntry[],
  images: PreparedProviderImage[],
): ScoredPreparedImage[] {
  const seen = new Set<number>();
  return entries.flatMap((entry) => {
    const localIndex = Math.trunc(Number(entry.index));
    const image = images[localIndex];
    if (!image || seen.has(localIndex)) return [];
    seen.add(localIndex);
    return [
      {
        image,
        score: sanitizeScore(entry.score),
        reason:
          typeof entry.reason === "string" && entry.reason.trim()
            ? entry.reason
            : "Ranked by vision model.",
      },
    ];
  });
}

function normalizeSelectionEntries(
  entries: DiverseSelectionEntry[],
  images: PreparedProviderImage[],
): SelectedPreparedImage[] {
  const seen = new Set<number>();
  return entries.flatMap((entry) => {
    const localIndex = Math.trunc(Number(entry.index));
    const image = images[localIndex];
    if (!image || seen.has(localIndex)) return [];
    seen.add(localIndex);
    return [
      {
        image,
        reason:
          typeof entry.reason === "string" && entry.reason.trim()
            ? entry.reason
            : "Selected by vision model.",
        rotationDegrees: sanitizeRotation(entry.rotationDegrees),
      },
    ];
  });
}

function uniquePreparedImages(
  images: PreparedProviderImage[],
): PreparedProviderImage[] {
  const bySourceIndex = new Map<number, PreparedProviderImage>();
  for (const image of images) bySourceIndex.set(image.sourceIndex, image);
  return [...bySourceIndex.values()].sort((a, b) => a.sourceIndex - b.sourceIndex);
}

async function rankPreparedChunk(input: {
  images: PreparedProviderImage[];
  send: (images: PreparedProviderImage[]) => Promise<RankingEntry[]>;
  provider: "OpenAI" | "Azure";
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<{
  acceptedImages: PreparedProviderImage[];
  scored: ScoredPreparedImage[];
}> {
  await input.checkpoint();
  try {
    const ranking = await input.send(input.images);
    return {
      acceptedImages: input.images,
      scored: normalizeRankingEntries(ranking, input.images),
    };
  } catch (err) {
    if (input.provider === "Azure" && isAzureContentPolicyViolation(err)) {
      if (input.images.length === 1) {
        await writeLog(
          input.log,
          `Skipping image candidate ${input.images[0].sourceIndex} because Azure content safety blocked it.`,
        );
        return { acceptedImages: [], scored: [] };
      }
      await writeLog(
        input.log,
        `Azure content safety blocked a ${input.images.length}-image ranking chunk; retrying that chunk one image at a time.`,
      );
      const results = await mapWithConcurrency(
        input.images,
        PROVIDER_CHUNK_CONCURRENCY,
        (image) => rankPreparedChunk({ ...input, images: [image] }),
      );
      return {
        acceptedImages: results.flatMap((result) => result.acceptedImages),
        scored: results.flatMap((result) => result.scored),
      };
    }

    if (
      (err instanceof RequestTimeoutError || shouldSplitProviderError(err)) &&
      input.images.length > 1
    ) {
      await writeLog(
        input.log,
        `${input.provider} could not rank a ${input.images.length}-image chunk (${err instanceof Error ? err.message : String(err)}); splitting it into smaller chunks.`,
      );
      const midpoint = Math.ceil(input.images.length / 2);
      const left = await rankPreparedChunk({
        ...input,
        images: input.images.slice(0, midpoint),
      });
      const right = await rankPreparedChunk({
        ...input,
        images: input.images.slice(midpoint),
      });
      return {
        acceptedImages: [...left.acceptedImages, ...right.acceptedImages],
        scored: [...left.scored, ...right.scored],
      };
    }

    if (err instanceof RequestTimeoutError && input.images.length === 1) {
      await writeLog(
        input.log,
        `Skipping image candidate ${input.images[0].sourceIndex} because ${input.provider} timed out while ranking it.`,
      );
      return { acceptedImages: [], scored: [] };
    }

    throw err;
  }
}

async function rankPreparedImages(input: {
  preparedImages: PreparedProviderImage[];
  chunkSize: number;
  send: (images: PreparedProviderImage[]) => Promise<RankingEntry[]>;
  provider: "OpenAI" | "Azure";
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<RankingResult> {
  const chunks = chunkArray(input.preparedImages, input.chunkSize);
  if (chunks.length > 1) {
    await writeLog(
      input.log,
      `Ranking ${input.preparedImages.length} image candidate(s) in ${chunks.length} ${input.provider} request chunk(s).`,
    );
  }

  const chunkResults = await mapWithConcurrency(
    chunks,
    PROVIDER_CHUNK_CONCURRENCY,
    (images) => rankPreparedChunk({ ...input, images }),
  );
  const acceptedImages = uniquePreparedImages(
    chunkResults.flatMap((result) => result.acceptedImages),
  );
  if (acceptedImages.length === 0) {
    throw new Error(`${input.provider} could not rank any image candidates.`);
  }

  const indexBySource = new Map(
    acceptedImages.map((image, index) => [image.sourceIndex, index]),
  );
  const ranking = chunkResults
    .flatMap((result) => result.scored)
    .flatMap((scored) => {
      const index = indexBySource.get(scored.image.sourceIndex);
      if (index === undefined) return [];
      return [{ index, score: scored.score, reason: scored.reason }];
    });

  return {
    ranking,
    candidates: acceptedImages.map((image) => image.candidate),
  };
}

async function rankWithOpenAI(
  config: Record<string, unknown>,
  model: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<RankingResult> {
  const preparedImages = await prepareProviderImages(
    candidates,
    "OpenAI",
    log,
    checkpoint,
  );
  if (preparedImages.length === 0) {
    throw new Error("No image candidates could be prepared for OpenAI vision.");
  }

  return rankPreparedImages({
    preparedImages,
    chunkSize: OPENAI_RANK_CHUNK_SIZE,
    provider: "OpenAI",
    log,
    checkpoint,
    send: async (images) => {
      const res = await sendOpenAIChatCompletion(
        config,
        model,
        buildMessages(
          criteria,
          location,
          images.map((image) => image.visionUrl),
        ),
        responseFormat,
      );
      return parseRankingResponse(res, "OpenAI");
    },
  });
}

async function rankWithAzure(
  config: Record<string, unknown>,
  deploymentName: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<RankingResult> {
  const preparedImages = await prepareProviderImages(
    candidates,
    "Azure",
    log,
    checkpoint,
  );
  if (preparedImages.length === 0) {
    throw new Error("No image candidates could be prepared for Azure vision.");
  }

  return rankPreparedImages({
    preparedImages,
    chunkSize: AZURE_RANK_CHUNK_SIZE,
    provider: "Azure",
    log,
    checkpoint,
    send: async (images) => {
      const res = await sendAzureChatCompletion(
        config,
        deploymentName,
        buildMessages(
          criteria,
          location,
          images.map((image) => image.visionUrl),
        ),
        responseFormat,
      );
      return parseRankingResponse(res, "Azure");
    },
  });
}

function selectionCountForChunk(
  totalImages: number,
  totalSelections: number,
  chunkLength: number,
) {
  if (totalImages <= 0) return 0;
  return Math.min(
    chunkLength,
    Math.max(1, Math.ceil((totalSelections * chunkLength) / totalImages) + 1),
  );
}

async function selectPreparedChunk(input: {
  images: PreparedProviderImage[];
  totalImages: number;
  selectionCount: number;
  send: (
    images: PreparedProviderImage[],
    selectionCount: number,
  ) => Promise<DiverseSelectionEntry[]>;
  provider: "OpenAI" | "Azure";
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<{
  acceptedImages: PreparedProviderImage[];
  selected: SelectedPreparedImage[];
}> {
  await input.checkpoint();
  try {
    const count = selectionCountForChunk(
      input.totalImages,
      input.selectionCount,
      input.images.length,
    );
    const selection = await input.send(input.images, count);
    return {
      acceptedImages: input.images,
      selected: normalizeSelectionEntries(selection, input.images),
    };
  } catch (err) {
    if (input.provider === "Azure" && isAzureContentPolicyViolation(err)) {
      if (input.images.length === 1) {
        await writeLog(
          input.log,
          `Skipping image candidate ${input.images[0].sourceIndex} because Azure content safety blocked it.`,
        );
        return { acceptedImages: [], selected: [] };
      }
      await writeLog(
        input.log,
        `Azure content safety blocked a ${input.images.length}-image diversity chunk; retrying that chunk one image at a time.`,
      );
      const results = await mapWithConcurrency(
        input.images,
        PROVIDER_CHUNK_CONCURRENCY,
        (image) => selectPreparedChunk({ ...input, images: [image] }),
      );
      return {
        acceptedImages: results.flatMap((result) => result.acceptedImages),
        selected: results.flatMap((result) => result.selected),
      };
    }

    if (
      (err instanceof RequestTimeoutError || shouldSplitProviderError(err)) &&
      input.images.length > 1
    ) {
      await writeLog(
        input.log,
        `${input.provider} could not select from a ${input.images.length}-image diversity chunk (${err instanceof Error ? err.message : String(err)}); splitting it into smaller chunks.`,
      );
      const midpoint = Math.ceil(input.images.length / 2);
      const left = await selectPreparedChunk({
        ...input,
        images: input.images.slice(0, midpoint),
      });
      const right = await selectPreparedChunk({
        ...input,
        images: input.images.slice(midpoint),
      });
      return {
        acceptedImages: [...left.acceptedImages, ...right.acceptedImages],
        selected: [...left.selected, ...right.selected],
      };
    }

    if (err instanceof RequestTimeoutError && input.images.length === 1) {
      await writeLog(
        input.log,
        `Skipping image candidate ${input.images[0].sourceIndex} because ${input.provider} timed out while selecting it.`,
      );
      return { acceptedImages: [], selected: [] };
    }

    throw err;
  }
}

async function selectPreparedImages(input: {
  preparedImages: PreparedProviderImage[];
  selectionCount: number;
  send: (
    images: PreparedProviderImage[],
    selectionCount: number,
  ) => Promise<DiverseSelectionEntry[]>;
  provider: "OpenAI" | "Azure";
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<DiverseSelectionResult> {
  const chunks = chunkArray(input.preparedImages, DIVERSITY_CHUNK_SIZE);
  if (chunks.length > 1) {
    await writeLog(
      input.log,
      `Selecting diverse images from ${input.preparedImages.length} ranked candidate(s) in ${chunks.length} ${input.provider} request chunk(s).`,
    );
  }

  const chunkResults = await mapWithConcurrency(
    chunks,
    PROVIDER_CHUNK_CONCURRENCY,
    (images) =>
      selectPreparedChunk({
        ...input,
        images,
        totalImages: input.preparedImages.length,
      }),
  );
  const acceptedImages = uniquePreparedImages(
    chunkResults.flatMap((result) => result.acceptedImages),
  );
  const indexBySource = new Map(
    acceptedImages.map((image, index) => [image.sourceIndex, index]),
  );
  const selection = chunkResults
    .flatMap((result) => result.selected)
    .flatMap((selected) => {
      const index = indexBySource.get(selected.image.sourceIndex);
      if (index === undefined) return [];
      return [
        {
          index,
          reason: selected.reason,
          rotationDegrees: selected.rotationDegrees,
        },
      ];
    });

  return {
    selection,
    candidates: acceptedImages.map((image) => image.candidate),
  };
}

async function selectDiverseWithOpenAI(
  config: Record<string, unknown>,
  model: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
  selectionCount: number,
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<DiverseSelectionResult> {
  const preparedImages = await prepareProviderImages(
    candidates,
    "OpenAI",
    log,
    checkpoint,
  );
  if (preparedImages.length === 0) {
    throw new Error("No image candidates could be prepared for OpenAI vision.");
  }

  return selectPreparedImages({
    preparedImages,
    selectionCount,
    provider: "OpenAI",
    log,
    checkpoint,
    send: async (images, count) => {
      const res = await sendOpenAIChatCompletion(
        config,
        model,
        buildDiverseSelectionMessages(
          criteria,
          location,
          count,
          images.map((image) => image.visionUrl),
        ),
        diverseSelectionResponseFormat,
      );
      return parseDiverseSelectionResponse(res, "OpenAI");
    },
  });
}

async function selectDiverseWithAzure(
  config: Record<string, unknown>,
  deploymentName: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
  selectionCount: number,
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<DiverseSelectionResult> {
  const preparedImages = await prepareProviderImages(
    candidates,
    "Azure",
    log,
    checkpoint,
  );
  if (preparedImages.length === 0) {
    throw new Error("No image candidates could be prepared for Azure vision.");
  }

  return selectPreparedImages({
    preparedImages,
    selectionCount,
    provider: "Azure",
    log,
    checkpoint,
    send: async (images, count) => {
      const res = await sendAzureChatCompletion(
        config,
        deploymentName,
        buildDiverseSelectionMessages(
          criteria,
          location,
          count,
          images.map((image) => image.visionUrl),
        ),
        diverseSelectionResponseFormat,
      );
      return parseDiverseSelectionResponse(res, "Azure");
    },
  });
}

function selectFromDiversityPlan(
  ranked: ImageCandidate[],
  result: DiverseSelectionResult,
  selectionCount: number,
): SelectedCandidate[] {
  const selected: SelectedCandidate[] = [];
  const used = new Set<ImageCandidate>();

  for (const entry of result.selection) {
    const candidate = result.candidates[entry.index];
    if (!candidate || used.has(candidate)) continue;
    selected.push({
      candidate,
      rotationDegrees: entry.rotationDegrees,
    });
    used.add(candidate);
    if (selected.length >= selectionCount) break;
  }

  for (const candidate of ranked) {
    if (selected.length >= selectionCount) break;
    if (used.has(candidate)) continue;
    selected.push({ candidate, rotationDegrees: 0 });
    used.add(candidate);
  }

  return selected;
}

async function normalizeSelectedImages(
  selected: SelectedCandidate[],
  log: LogFn,
  checkpoint: CheckpointFn,
): Promise<ImageCandidate[]> {
  return mapWithConcurrency(
    selected,
    NORMALIZE_CONCURRENCY,
    async ({ candidate, rotationDegrees }, index) => {
      await checkpoint();
      try {
        const { bytes, contentType } = await fetchImageBytes(
          candidate,
          MAX_NORMALIZED_IMAGE_BYTES,
        );
        if (contentType === "image/svg+xml" || contentType === "image/gif") {
          return candidate;
        }

        const sharp = (await import("sharp")).default;
        let pipeline = sharp(bytes, { failOn: "none" }).autoOrient();
        if (rotationDegrees !== 0) pipeline = pipeline.rotate(rotationDegrees);

        const normalized = await pipeline
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer();
        const { url } = await storage().put(
          `rank-images/normalized/${crypto.randomUUID()}.jpg`,
          normalized,
          "image/jpeg",
        );
        await writeLog(
          log,
          `normalized selected image ${index + 1} (${rotationDegrees}deg) -> ${url}`,
        );
        return { ...candidate, url };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await writeLog(
          log,
          `Could not normalize selected image ${index + 1}: ${reason}`,
        );
        return candidate;
      }
    },
  );
}

export const rankImagesNode: NodeDefinition<RankImagesConfig> = {
  ...rankImagesMeta,

  async run(ctx) {
    const allCandidates = normalizeCandidates(ctx.inputs.candidates);
    const location = String(ctx.inputs.location ?? "");
    const checkpoint = ctx.throwIfStopped ?? noopCheckpoint;

    if (allCandidates.length === 0) {
      await ctx.log("No image candidates were available to rank.");
      return {
        type: "output",
        outputs: { ranked: [], selected: [], selectedUrls: [], best: "" },
      };
    }

    const candidates = allCandidates.slice(0, MAX_CANDIDATES);
    if (allCandidates.length > candidates.length) {
      await ctx.log(
        `Rank Images received ${allCandidates.length} candidates; using the first ${MAX_CANDIDATES}.`,
      );
    }

    const connection = await getConnection(ctx.config.connectionId);
    if (!connection) throw new Error("Select an AI connection.");

    const configuredModels = modelOptionsForConnection({
      type: connection.type,
      config: connection.config ?? {},
    });
    if (!configuredModels.some((option) => option.value === ctx.config.model)) {
      throw new Error(
        "Select one of the models configured on the chosen AI connection.",
      );
    }

    await checkpoint();
    const ranking =
      connection.type === "openai"
        ? await rankWithOpenAI(
            connection.config ?? {},
            ctx.config.model,
            ctx.config.criteria,
            location,
            candidates,
            ctx.log,
            checkpoint,
          )
        : connection.type === "azure-foundry"
          ? await rankWithAzure(
              connection.config ?? {},
              ctx.config.model,
              ctx.config.criteria,
              location,
              candidates,
              ctx.log,
              checkpoint,
            )
          : (() => {
              throw new Error(
                `Unsupported AI connection type: ${connection.type}`,
              );
            })();

    await checkpoint();
    const ranked = ranking.ranking
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((r) => ranking.candidates[r.index])
      .filter((c): c is ImageCandidate => Boolean(c));
    for (const c of ranking.candidates) if (!ranked.includes(c)) ranked.push(c);

    const selectionCount = Math.min(ctx.config.selectionCount, ranked.length);
    let selectedPlan: SelectedCandidate[] = ranked
      .slice(0, selectionCount)
      .map((candidate) => ({ candidate, rotationDegrees: 0 as const }));
    if (ranked.length > selectionCount && selectionCount > 1) {
      const poolSize = Math.min(
        ranked.length,
        Math.max(selectionCount * 3, selectionCount + 10),
        50,
      );
      const pool = ranked.slice(0, poolSize);
      try {
        await checkpoint();
        const diverseSelection =
          connection.type === "openai"
            ? await selectDiverseWithOpenAI(
                connection.config ?? {},
                ctx.config.model,
                ctx.config.criteria,
                location,
                pool,
                selectionCount,
                ctx.log,
                checkpoint,
              )
            : connection.type === "azure-foundry"
              ? await selectDiverseWithAzure(
                  connection.config ?? {},
                  ctx.config.model,
                  ctx.config.criteria,
                  location,
                  pool,
                  selectionCount,
                  ctx.log,
                  checkpoint,
                )
              : { selection: [], candidates: [] };
        selectedPlan = selectFromDiversityPlan(
          ranked,
          diverseSelection,
          selectionCount,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await ctx.log(
          `Diverse selection failed; using the score-ranked top ${selectionCount}: ${reason}`,
        );
      }
    }

    await checkpoint();
    const selectedOriginals = new Set(
      selectedPlan.map((selected) => selected.candidate),
    );
    const selected = await normalizeSelectedImages(
      selectedPlan,
      ctx.log,
      checkpoint,
    );
    const finalRanked = [
      ...selected,
      ...ranked.filter((candidate) => !selectedOriginals.has(candidate)),
    ];

    return {
      type: "output",
      outputs: {
        ranked: finalRanked,
        selected,
        selectedUrls: selected.map((candidate) => candidate.url),
        best: finalRanked[0]?.url ?? "",
      },
    };
  },
};
