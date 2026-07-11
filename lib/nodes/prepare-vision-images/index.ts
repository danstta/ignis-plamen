import { getConnection } from "@/lib/connections/service";
import { fetchGoogleDriveImageFile } from "@/lib/connections/google-drive/api";
import { publicAppUrl } from "@/lib/env";
import { isImageContentType } from "@/lib/images/content-types";
import {
  convertImageToJpeg,
  inferImageContentType,
  isHeicLikeImage,
} from "@/lib/images/normalize";
import { assetStorage } from "@/lib/storage";
import { normalizeImageCandidates } from "../image-input";
import type { ImageCandidate, NodeDefinition } from "../types";
import {
  compactReason,
  imageLogLabel,
  mapWithConcurrency,
  withTimeout,
} from "../vision-image-utils";
import {
  prepareVisionImagesMeta,
  type PrepareVisionImagesConfig,
} from "./meta";

const PREPARE_CONCURRENCY = 2;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const CONVERSION_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VISION_DIMENSION = 2048;

type PreparedVisionImage = ImageCandidate & {
  sourceIndex: number;
  standardized: true;
  converted: boolean;
};

type SkippedVisionImage = {
  candidate: ImageCandidate;
  sourceIndex: number;
  reason: string;
};

type PrepareResult =
  | { image: PreparedVisionImage; skipped?: never }
  | { image?: never; skipped: SkippedVisionImage };

type DownloadedImage = {
  bytes: Buffer;
  contentType: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function candidateFileId(candidate: ImageCandidate): string | undefined {
  return stringField(candidate.id);
}

function shouldConvert(candidate: ImageCandidate): boolean {
  return isHeicLikeImage({
    contentType: candidate.mimeType,
    name: candidate.name ?? candidate.title ?? candidate.url,
  });
}

function cleanPathPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanStoragePrefix(value: string): string {
  const parts = value
    .split(/[\\/]+/)
    .map(cleanPathPart)
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : "vision-images";
}

function storageKey(input: {
  prefix: string;
  runId: string;
  nodeId: string;
  sourceIndex: number;
  candidate: ImageCandidate;
}): string {
  const name = cleanPathPart(input.candidate.name ?? input.candidate.title ?? "");
  const suffix = name ? `-${name}` : "";
  return `${input.prefix}/${cleanPathPart(input.runId)}/${cleanPathPart(input.nodeId)}-${input.sourceIndex + 1}${suffix}.jpg`;
}

function absoluteServerUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return url;
  const base =
    publicAppUrl() ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  return base ? `${base}${url}` : url;
}

function publicStorageUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return url;
  const base = publicAppUrl();
  return base ? `${base}${url}` : url;
}

function parseDataUrl(url: string): DownloadedImage {
  const match = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Invalid data URL");

  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));
  return {
    bytes,
    contentType: match[1] || "application/octet-stream",
  };
}

async function fetchUrlImage(candidate: ImageCandidate): Promise<DownloadedImage> {
  if (candidate.url.startsWith("data:")) return parseDataUrl(candidate.url);

  const url = absoluteServerUrl(candidate.url);
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unsupported image URL scheme: ${candidate.url.slice(0, 60)}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      throw new Error(`Fetch failed (${res.status}): ${message}`);
    }

    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType:
        res.headers.get("content-type") ??
        candidate.mimeType ??
        "application/octet-stream",
    };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `image download timed out after ${Math.round(DOWNLOAD_TIMEOUT_MS / 1000)}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadOriginalImage(input: {
  candidate: ImageCandidate;
  connectionId: string;
}): Promise<DownloadedImage> {
  const fileId = candidateFileId(input.candidate);
  if (fileId && input.connectionId) {
    const image = await withTimeout(
      fetchGoogleDriveImageFile({
        connectionId: input.connectionId,
        fileId,
      }),
      DOWNLOAD_TIMEOUT_MS,
      "Google Drive image download",
    );
    return {
      bytes: Buffer.from(image.bytes),
      contentType: image.contentType,
    };
  }

  return fetchUrlImage(input.candidate);
}

function normalizedImageType(input: {
  image: DownloadedImage;
  candidate: ImageCandidate;
}): string {
  return (
    inferImageContentType({
      bytes: input.image.bytes,
      contentType: input.image.contentType,
      name: input.candidate.name ?? input.candidate.title ?? input.candidate.url,
    }) ||
    inferImageContentType({
      bytes: input.image.bytes,
      contentType: input.candidate.mimeType,
      name: input.candidate.name ?? input.candidate.title ?? input.candidate.url,
    }) ||
    "application/octet-stream"
  );
}

async function convertAndStore(input: {
  candidate: ImageCandidate;
  sourceIndex: number;
  connectionId: string;
  storagePrefix: string;
  jpegQuality: number;
  runId: string;
  nodeId: string;
  log: (message: string) => void | Promise<void>;
}): Promise<PreparedVisionImage> {
  const downloaded = await downloadOriginalImage({
    candidate: input.candidate,
    connectionId: input.connectionId,
  });
  const sourceType = normalizedImageType({
    image: downloaded,
    candidate: input.candidate,
  });
  if (!isImageContentType(sourceType)) {
    throw new Error(`expected image content-type, got "${sourceType}"`);
  }

  await input.log(
    `Converting ${imageLogLabel(input.candidate, input.sourceIndex)} from ${sourceType} to image/jpeg for vision links.`,
  );
  const jpeg = await withTimeout(
    convertImageToJpeg(downloaded.bytes, {
      quality: input.jpegQuality,
      maxBytes: MAX_IMAGE_BYTES,
      maxDimension: MAX_VISION_DIMENSION,
    }),
    CONVERSION_TIMEOUT_MS,
    "HEIC conversion",
  );
  const key = storageKey({
    prefix: input.storagePrefix,
    runId: input.runId,
    nodeId: input.nodeId,
    sourceIndex: input.sourceIndex,
    candidate: input.candidate,
  });
  const stored = await assetStorage().put(key, jpeg, "image/jpeg");
  const url = publicStorageUrl(stored.url);
  await input.log(
    `Stored converted image ${input.sourceIndex + 1} as image/jpeg for vision links.`,
  );

  return {
    ...input.candidate,
    url,
    previewUrl: url,
    originalUrl: input.candidate.url,
    originalMimeType: input.candidate.mimeType ?? sourceType,
    mimeType: "image/jpeg",
    sourceIndex: input.sourceIndex,
    converted: true,
    standardized: true,
  };
}

async function prepareOne(input: {
  candidate: ImageCandidate;
  sourceIndex: number;
  connectionId: string;
  storagePrefix: string;
  jpegQuality: number;
  runId: string;
  nodeId: string;
  log: (message: string) => void | Promise<void>;
}): Promise<PrepareResult> {
  try {
    if (!shouldConvert(input.candidate)) {
      return {
        image: {
          ...input.candidate,
          url: absoluteServerUrl(input.candidate.url),
          sourceIndex: input.sourceIndex,
          converted: false,
          standardized: true,
        },
      };
    }

    return {
      image: await convertAndStore(input),
    };
  } catch (err) {
    return {
      skipped: {
        candidate: input.candidate,
        sourceIndex: input.sourceIndex,
        reason: compactReason(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

function collectConfiguredConnectionId(input: {
  config: PrepareVisionImagesConfig;
  candidates: ImageCandidate[];
}): string {
  if (input.config.connectionId.trim()) return input.config.connectionId.trim();

  for (const candidate of input.candidates) {
    if (!isRecord(candidate)) continue;
    const url = stringField(candidate.url);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      const connectionId = parsed.searchParams.get("connectionId")?.trim();
      if (connectionId) return connectionId;
    } catch {
      // Not a URL with query params.
    }
  }

  return "";
}

export const prepareVisionImagesNode: NodeDefinition<PrepareVisionImagesConfig> = {
  ...prepareVisionImagesMeta,
  usesDurableSteps: true,

  async run(ctx) {
    const allCandidates = normalizeImageCandidates(
      ctx.inputs.images ?? ctx.inputs.candidates,
    );
    const candidates = allCandidates.slice(0, ctx.config.maxImages);
    if (allCandidates.length > candidates.length) {
      await ctx.log(
        `Prepare Vision Images received ${allCandidates.length} image(s); using the first ${candidates.length}.`,
      );
    }

    const connectionId = collectConfiguredConnectionId({
      config: ctx.config,
      candidates,
    });
    if (ctx.config.connectionId.trim()) {
      const connection = await getConnection(ctx.config.connectionId);
      if (!connection || connection.type !== "google-drive") {
        throw new Error("Select a valid Google Drive connection.");
      }
    }

    if (candidates.length === 0) {
      await ctx.log("No images were available to prepare.");
      return {
        type: "output",
        outputs: {
          images: [],
          urls: [],
          converted: [],
          skipped: [],
          firstImage: "",
          count: 0,
          convertedCount: 0,
        },
      };
    }

    const storagePrefix = cleanStoragePrefix(ctx.config.storagePrefix);
    await ctx.log(
      `Preparing ${candidates.length} image link(s) for vision. HEIC/HEIF images will be converted once and stored as JPEG.`,
    );

    const results = await mapWithConcurrency(
      candidates,
      PREPARE_CONCURRENCY,
      (candidate, sourceIndex) => {
        const run = () =>
          prepareOne({
            candidate,
            sourceIndex,
            connectionId,
            storagePrefix,
            jpegQuality: ctx.config.jpegQuality,
            runId: ctx.runId,
            nodeId: ctx.nodeId,
            log: ctx.log,
          });
        return ctx.step ? ctx.step(`prepare:${sourceIndex}`, run) : run();
      },
    );

    const images = results.flatMap((result) =>
      result.image ? [result.image] : [],
    );
    const skipped = results.flatMap((result) =>
      result.skipped ? [result.skipped] : [],
    );
    for (const item of skipped) {
      await ctx.log(
        `Skipping image ${item.sourceIndex + 1}: ${item.reason}`,
      );
    }

    const converted = images.filter((image) => image.converted);
    await ctx.log(
      `Prepared ${images.length} image link(s); converted ${converted.length} HEIC/HEIF image(s).`,
    );

    return {
      type: "output",
      outputs: {
        images,
        urls: images.map((image) => image.url),
        converted,
        skipped,
        firstImage: images[0]?.url ?? "",
        count: images.length,
        convertedCount: converted.length,
      },
    };
  },
};
