import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import {
  chunkArray,
  compactReason,
  isAzureContentPolicyViolation,
  jsonSchemaResponseFormat,
  mapWithConcurrency,
  noopCheckpoint,
  parseJsonResponse,
  prepareProviderImageLinks,
  RequestTimeoutError,
  sendAzureChatCompletion,
  sendOpenAIChatCompletion,
  shouldSplitProviderError,
  visionImageContentItems,
  writeLog,
  type ChatMessages,
  type CheckpointFn,
  type LogFn,
  type PreparedImage,
  type ResponseFormat,
} from "../vision-image-utils";
import { normalizeImageCandidates } from "../image-input";
import type { ImageCandidate, NodeDefinition, NodeStepRunner } from "../types";
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

type RatingEntry = {
  index: number;
  score: number;
  reason: string;
};

type ScoreState = {
  candidate: ImageCandidate;
  sourceIndex: number;
  score: number;
  reason: string;
  rated: boolean;
};

type ScorePatch = Pick<ScoreState, "sourceIndex" | "score" | "reason" | "rated">;

const responseFormat: ResponseFormat = jsonSchemaResponseFormat(
  "image_ratings",
  responseSchema,
);

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
    ...visionImageContentItems(images),
  ];

  return [{ role: "user", content }];
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

    const reason = compactReason(err instanceof Error ? err.message : String(err));
    const indexes = input.images
      .map((image) => image.sourceIndex + 1)
      .join(", ");
    await writeLog(
      input.log,
      `Rating image(s) ${indexes} failed: ${reason}. Marking them unrated and continuing.`,
    );
    return input.images.map((image) => ({
      sourceIndex: image.sourceIndex,
      score: 0,
      reason,
      rated: false,
    }));
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
  step?: NodeStepRunner;
}): Promise<ScorePatch[]> {
  const chunks = chunkArray(input.preparedImages, input.imagesPerCall);
  await writeLog(
    input.log,
    `Rating ${input.preparedImages.length} prepared image(s) in ${chunks.length} ${input.provider} call(s), up to ${input.concurrentCalls} call(s) at once.`,
  );

  const chunkResults = await mapWithConcurrency(
    chunks,
    input.concurrentCalls,
    (images, chunkIndex) => {
      const rate = () => ratePreparedChunk({ ...input, images });
      return input.step ? input.step(`rate:${chunkIndex}`, rate) : rate();
    },
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
  step?: NodeStepRunner;
}): Promise<ScorePatch[]> {
  return ratePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "OpenAI",
    log: input.log,
    checkpoint: input.checkpoint,
    step: input.step,
    send: async (images) => {
      const res = await sendOpenAIChatCompletion({
        config: input.config,
        model: input.model,
        messages: buildMessages(input.criteria, images),
        responseFormat,
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
  step?: NodeStepRunner;
}): Promise<ScorePatch[]> {
  return ratePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "Azure",
    log: input.log,
    checkpoint: input.checkpoint,
    step: input.step,
    send: async (images) => {
      const res = await sendAzureChatCompletion({
        config: input.config,
        deploymentName: input.deploymentName,
        messages: buildMessages(input.criteria, images),
        responseFormat,
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
  usesDurableSteps: true,

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
    await ctx.log(`Preparing ${candidates.length} image link(s) for vision rating.`);
    const prepared = prepareProviderImageLinks({ candidates });
    for (const skipped of prepared.skipped) {
      scores[skipped.sourceIndex] = {
        ...scores[skipped.sourceIndex],
        reason: `Could not use image link for vision rating: ${skipped.reason}`,
        rated: false,
      };
    }
    const preparedImages = prepared.preparedImages;

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
              step: ctx.step,
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
                step: ctx.step,
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
