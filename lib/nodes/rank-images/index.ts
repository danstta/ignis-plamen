import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import { convertImageToJpeg } from "@/lib/images/normalize";
import { normalizeImageCandidates } from "../image-input";
import type { ImageCandidate, NodeDefinition } from "../types";
import { rankImagesMeta, type RankImagesConfig } from "./meta";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ratings: {
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
  required: ["ratings"],
} as const;

type ChatMessages = { role: "user"; content: unknown[] }[];

type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: unknown;
  };
};

type RatingEntry = {
  index: number;
  score: number;
  reason: string;
};

type PreparedImage = {
  candidate: ImageCandidate;
  sourceIndex: number;
  visionUrl: string;
};

type ScoreState = {
  candidate: ImageCandidate;
  sourceIndex: number;
  score: number;
  reason: string;
  rated: boolean;
};

type ScorePatch = Pick<ScoreState, "sourceIndex" | "score" | "reason" | "rated">;

type LogFn = (message: string) => void | Promise<void>;
type CheckpointFn = () => Promise<void>;

const IMAGE_FETCH_USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
const MAX_PROVIDER_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const CHAT_COMPLETION_TIMEOUT_MS = 45_000;
const IMAGE_FETCH_CONCURRENCY = 8;
const PROVIDER_SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const responseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "image_ratings",
    strict: true,
    schema: responseSchema,
  },
};

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

async function writeLog(log: LogFn, message: string) {
  await log(message);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
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

  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `expected image content-type, got "${contentType || "unknown"}"`,
    );
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error(`image is ${contentLength} bytes`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
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
    const converted = await convertImageToJpeg(image.bytes, {
      quality: 90,
      maxBytes: MAX_PROVIDER_IMAGE_BYTES,
    });
    await writeLog(
      log,
      `Converted image ${sourceIndex + 1} from ${image.contentType} to image/jpeg for vision rating.`,
    );
    return imageDataUrl(converted, "image/jpeg");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `unsupported image content-type ${image.contentType}; conversion failed: ${reason}`,
    );
  }
}

async function prepareProviderImages(input: {
  candidates: ImageCandidate[];
  scores: ScoreState[];
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<PreparedImage[]> {
  const prepared = await mapWithConcurrency(
    input.candidates,
    IMAGE_FETCH_CONCURRENCY,
    async (candidate, sourceIndex) => {
      await input.checkpoint();
      try {
        return {
          candidate,
          sourceIndex,
          visionUrl: await providerImageToDataUrl(candidate, sourceIndex, input.log),
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        input.scores[sourceIndex] = {
          ...input.scores[sourceIndex],
          reason: `Could not prepare image for vision rating: ${reason}`,
          rated: false,
        };
        await writeLog(
          input.log,
          `Skipping vision rating for image ${sourceIndex + 1}: ${reason}`,
        );
        return null;
      }
    },
  );

  return prepared.filter((image): image is PreparedImage => Boolean(image));
}

function buildMessages(criteria: string, images: PreparedImage[]): ChatMessages {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Rate each image against the criteria below. Return one rating for every image index.\n\n` +
        `Criteria:\n${criteria.trim() || "Choose the strongest, highest-quality image."}\n\n` +
        `Use an absolute 0-100 score scale so scores remain comparable across separate batches:\n` +
        `- 90-100: excellent fit\n` +
        `- 70-89: strong fit\n` +
        `- 40-69: usable but flawed or less relevant\n` +
        `- 0-39: poor fit, unusable, or clearly violates the criteria\n\n` +
        `Do not rank only relative to this small batch. Judge each image independently on that shared scale. ` +
        `Keep each reason short and concrete.`,
    },
  ];

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

  return [{ role: "user", content }];
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

async function parseRatingsResponse(
  res: Response,
  provider: string,
): Promise<RatingEntry[]> {
  const parsed = await parseJsonResponse<{ ratings?: RatingEntry[] }>(
    res,
    provider,
  );
  return Array.isArray(parsed.ratings) ? parsed.ratings : [];
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

async function sendOpenAIChatCompletion(input: {
  config: Record<string, unknown>;
  model: string;
  messages: ChatMessages;
}): Promise<Response> {
  return fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: openAIHeaders(input.config),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        response_format: responseFormat,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "OpenAI chat completion",
  );
}

async function sendAzureChatCompletion(input: {
  config: Record<string, unknown>;
  deploymentName: string;
  messages: ChatMessages;
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
        response_format: responseFormat,
      }),
    },
    CHAT_COMPLETION_TIMEOUT_MS,
    "Azure chat completion",
  );
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

function sanitizeScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function normalizeRatingEntries(
  entries: RatingEntry[],
  images: PreparedImage[],
): ScorePatch[] {
  const byLocalIndex = new Map<number, RatingEntry>();
  for (const entry of entries) {
    const localIndex = Math.trunc(Number(entry.index));
    if (!images[localIndex] || byLocalIndex.has(localIndex)) continue;
    byLocalIndex.set(localIndex, entry);
  }

  return images.map((image, localIndex) => {
    const entry = byLocalIndex.get(localIndex);
    if (!entry) {
      return {
        sourceIndex: image.sourceIndex,
        score: 0,
        reason: "The model did not return a rating for this image.",
        rated: false,
      };
    }

    return {
      sourceIndex: image.sourceIndex,
      score: sanitizeScore(entry.score),
      reason:
        typeof entry.reason === "string" && entry.reason.trim()
          ? entry.reason.trim()
          : "Rated by vision model.",
      rated: true,
    };
  });
}

async function ratePreparedChunk(input: {
  images: PreparedImage[];
  provider: "OpenAI" | "Azure";
  send: (images: PreparedImage[]) => Promise<RatingEntry[]>;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<ScorePatch[]> {
  await input.checkpoint();
  try {
    const ratings = await input.send(input.images);
    return normalizeRatingEntries(ratings, input.images);
  } catch (err) {
    if (
      (input.provider === "Azure" && isAzureContentPolicyViolation(err)) ||
      err instanceof RequestTimeoutError ||
      shouldSplitProviderError(err)
    ) {
      if (input.images.length > 1) {
        const reason = err instanceof Error ? err.message : String(err);
        await writeLog(
          input.log,
          `${input.provider} could not rate a ${input.images.length}-image batch (${reason}); splitting it into smaller batches.`,
        );
        const midpoint = Math.ceil(input.images.length / 2);
        const left = await ratePreparedChunk({
          ...input,
          images: input.images.slice(0, midpoint),
        });
        const right = await ratePreparedChunk({
          ...input,
          images: input.images.slice(midpoint),
        });
        return [...left, ...right];
      }

      const reason =
        input.provider === "Azure" && isAzureContentPolicyViolation(err)
          ? "Azure content safety blocked this image."
          : err instanceof Error
            ? err.message
            : String(err);
      await writeLog(
        input.log,
        `Rating image ${input.images[0].sourceIndex + 1} failed: ${reason}`,
      );
      return [
        {
          sourceIndex: input.images[0].sourceIndex,
          score: 0,
          reason,
          rated: false,
        },
      ];
    }

    throw err;
  }
}

async function ratePreparedImages(input: {
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  provider: "OpenAI" | "Azure";
  send: (images: PreparedImage[]) => Promise<RatingEntry[]>;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<ScorePatch[]> {
  const chunks = chunkArray(input.preparedImages, input.imagesPerCall);
  await writeLog(
    input.log,
    `Rating ${input.preparedImages.length} prepared image(s) in ${chunks.length} ${input.provider} call(s), up to ${input.concurrentCalls} call(s) at once.`,
  );

  const chunkResults = await mapWithConcurrency(
    chunks,
    input.concurrentCalls,
    (images) => ratePreparedChunk({ ...input, images }),
  );
  return chunkResults.flat();
}

async function rateWithOpenAI(input: {
  config: Record<string, unknown>;
  model: string;
  criteria: string;
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<ScorePatch[]> {
  return ratePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "OpenAI",
    log: input.log,
    checkpoint: input.checkpoint,
    send: async (images) => {
      const res = await sendOpenAIChatCompletion({
        config: input.config,
        model: input.model,
        messages: buildMessages(input.criteria, images),
      });
      return parseRatingsResponse(res, "OpenAI");
    },
  });
}

async function rateWithAzure(input: {
  config: Record<string, unknown>;
  deploymentName: string;
  criteria: string;
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  log: LogFn;
  checkpoint: CheckpointFn;
}): Promise<ScorePatch[]> {
  return ratePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "Azure",
    log: input.log,
    checkpoint: input.checkpoint,
    send: async (images) => {
      const res = await sendAzureChatCompletion({
        config: input.config,
        deploymentName: input.deploymentName,
        messages: buildMessages(input.criteria, images),
      });
      return parseRatingsResponse(res, "Azure");
    },
  });
}

function applyScorePatches(scores: ScoreState[], patches: ScorePatch[]) {
  for (const patch of patches) {
    const current = scores[patch.sourceIndex];
    if (!current) continue;
    scores[patch.sourceIndex] = {
      ...current,
      score: patch.score,
      reason: patch.reason,
      rated: patch.rated,
    };
  }
}

function sortedRankedImages(scores: ScoreState[]) {
  return scores
    .slice()
    .sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex)
    .map((entry, index) => ({
      ...entry.candidate,
      rank: index + 1,
      score: entry.score,
      reason: entry.reason,
      sourceIndex: entry.sourceIndex,
      rated: entry.rated,
    }));
}

function legacySelectionCount(rawConfig: Record<string, unknown> | undefined) {
  const value = Number(rawConfig?.selectionCount ?? 5);
  if (!Number.isFinite(value)) return 5;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

export const rankImagesNode: NodeDefinition<RankImagesConfig> = {
  ...rankImagesMeta,

  async run(ctx) {
    const allCandidates = normalizeImageCandidates(
      ctx.inputs.images ?? ctx.inputs.candidates,
    );
    const checkpoint = ctx.throwIfStopped ?? noopCheckpoint;

    if (allCandidates.length === 0) {
      await ctx.log("No images were available to rank.");
      return {
        type: "output",
        outputs: {
          ranked: [],
          rankedUrls: [],
          scores: [],
          selected: [],
          selectedUrls: [],
          best: "",
          count: 0,
        },
      };
    }

    const candidates = allCandidates.slice(0, ctx.config.maxImages);
    if (allCandidates.length > candidates.length) {
      await ctx.log(
        `Rank Images received ${allCandidates.length} image(s); using the first ${candidates.length}.`,
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

    const scores: ScoreState[] = candidates.map((candidate, sourceIndex) => ({
      candidate,
      sourceIndex,
      score: 0,
      reason: "Image was not rated.",
      rated: false,
    }));

    await checkpoint();
    await ctx.log(`Preparing ${candidates.length} image(s) for vision rating.`);
    const preparedImages = await prepareProviderImages({
      candidates,
      scores,
      log: ctx.log,
      checkpoint,
    });

    if (preparedImages.length > 0) {
      await checkpoint();
      const patches =
        connection.type === "openai"
          ? await rateWithOpenAI({
              config: connection.config ?? {},
              model: ctx.config.model,
              criteria: ctx.config.criteria,
              preparedImages,
              imagesPerCall: ctx.config.imagesPerCall,
              concurrentCalls: ctx.config.concurrentCalls,
              log: ctx.log,
              checkpoint,
            })
          : connection.type === "azure-foundry"
            ? await rateWithAzure({
                config: connection.config ?? {},
                deploymentName: ctx.config.model,
                criteria: ctx.config.criteria,
                preparedImages,
                imagesPerCall: ctx.config.imagesPerCall,
                concurrentCalls: ctx.config.concurrentCalls,
                log: ctx.log,
                checkpoint,
              })
            : (() => {
                throw new Error(
                  `Unsupported AI connection type: ${connection.type}`,
                );
              })();
      applyScorePatches(scores, patches);
    } else {
      await ctx.log("No images could be prepared for vision rating.");
    }

    await checkpoint();
    const ranked = sortedRankedImages(scores);
    const selected = ranked.slice(0, legacySelectionCount(ctx.rawConfig));
    await ctx.log(
      `Ranked ${ranked.length} image(s); ${scores.filter((score) => score.rated).length} received model ratings.`,
    );

    return {
      type: "output",
      outputs: {
        ranked,
        rankedUrls: ranked.map((candidate) => candidate.url),
        scores: ranked.map((candidate) => ({
          url: candidate.url,
          rank: candidate.rank,
          score: candidate.score,
          reason: candidate.reason,
          rated: candidate.rated,
          sourceIndex: candidate.sourceIndex,
        })),
        selected,
        selectedUrls: selected.map((candidate) => candidate.url),
        best: ranked[0]?.url ?? "",
        count: ranked.length,
      },
    };
  },
};
