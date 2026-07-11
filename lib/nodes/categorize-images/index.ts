import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import { normalizeImageCandidates } from "../image-input";
import type { ImageCandidate, NodeDefinition, NodeStepRunner } from "../types";
import {
  chunkArray,
  compactReason,
  isAzureContentPolicyViolation,
  jsonSchemaResponseFormat,
  mapWithConcurrency,
  noopCheckpoint,
  parseJsonResponse,
  prepareProviderImages,
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
  type ProviderName,
  type ResponseFormat,
} from "../vision-image-utils";
import {
  categorizeImagesMeta,
  DEFAULT_CATEGORIZE_IMAGES_PROMPT,
  DEFAULT_CATEGORIZE_IMAGES_SYSTEM_PROMPT,
  type CategorizeImagesConfig,
} from "./meta";

type CategorizationEntry = {
  index: number;
  category: string;
  reason: string;
};

type CategoryState = {
  candidate: ImageCandidate;
  sourceIndex: number;
  category: string;
  reason: string;
  categorized: boolean;
  rawCategory?: string;
};

type CategoryPatch = Pick<
  CategoryState,
  "sourceIndex" | "category" | "reason" | "categorized" | "rawCategory"
>;

function responseSchemaForCategories(categories: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      categorizations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            index: { type: "integer" },
            category: { type: "string", enum: categories },
            reason: { type: "string" },
          },
          required: ["index", "category", "reason"],
        },
      },
    },
    required: ["categorizations"],
  } as const;
}

function cleanCategory(value: string): string {
  return value
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCategories(value: string): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const piece of value.split(/\r?\n|,/)) {
    const category = cleanCategory(piece);
    if (!category) continue;
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
  }

  return categories;
}

function categoryLookup(categories: string[]): Map<string, string> {
  return new Map(categories.map((category) => [category.toLowerCase(), category]));
}

function canonicalCategory(
  value: unknown,
  categories: string[],
  lookup: Map<string, string>,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return categories.includes(trimmed) ? trimmed : lookup.get(trimmed.toLowerCase());
}

function buildMessages(input: {
  systemPrompt: string;
  prompt: string;
  categories: string[];
  images: PreparedImage[];
}): ChatMessages {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Categorize each image into exactly one allowed category. Return one categorization for every image index.\n\n` +
        `Allowed categories:\n${input.categories
          .map((category, index) => `${index + 1}. ${category}`)
          .join("\n")}\n\n` +
        `Categorization prompt:\n${input.prompt.trim() || DEFAULT_CATEGORIZE_IMAGES_PROMPT}\n\n` +
        `Rules:\n` +
        `- The category value must be exactly one of the allowed category strings.\n` +
        `- Do not create "other", "uncategorized", or any synonym unless it is listed above.\n` +
        `- If uncertain, choose the closest allowed category.\n` +
        `- Keep each reason short and concrete.`,
    },
    ...visionImageContentItems(input.images),
  ];

  return [
    {
      role: "system",
      content:
        input.systemPrompt.trim() || DEFAULT_CATEGORIZE_IMAGES_SYSTEM_PROMPT,
    },
    { role: "user", content },
  ];
}

async function parseCategorizationResponse(
  res: Response,
  provider: string,
): Promise<CategorizationEntry[]> {
  const parsed = await parseJsonResponse<{
    categorizations?: CategorizationEntry[];
  }>(res, provider);
  return Array.isArray(parsed.categorizations) ? parsed.categorizations : [];
}

function normalizeCategorizationEntries(input: {
  entries: CategorizationEntry[];
  images: PreparedImage[];
  categories: string[];
  fallbackCategory: string;
}): CategoryPatch[] {
  const lookup = categoryLookup(input.categories);
  const byLocalIndex = new Map<number, CategorizationEntry>();
  for (const entry of input.entries) {
    const localIndex = Math.trunc(Number(entry.index));
    if (!input.images[localIndex] || byLocalIndex.has(localIndex)) continue;
    byLocalIndex.set(localIndex, entry);
  }

  return input.images.map((image, localIndex) => {
    const entry = byLocalIndex.get(localIndex);
    if (!entry) {
      return {
        sourceIndex: image.sourceIndex,
        category: input.fallbackCategory,
        reason: "The model did not return a category for this image.",
        categorized: false,
      };
    }

    const category = canonicalCategory(entry.category, input.categories, lookup);
    if (!category) {
      const rawCategory =
        typeof entry.category === "string" && entry.category.trim()
          ? entry.category.trim()
          : "unknown";
      return {
        sourceIndex: image.sourceIndex,
        category: input.fallbackCategory,
        rawCategory,
        reason: `The model returned "${compactReason(rawCategory, 120)}", which is not one of the configured categories; defaulted to "${input.fallbackCategory}".`,
        categorized: false,
      };
    }

    return {
      sourceIndex: image.sourceIndex,
      category,
      reason:
        typeof entry.reason === "string" && entry.reason.trim()
          ? entry.reason.trim()
          : "Categorized by vision model.",
      categorized: true,
    };
  });
}

async function categorizePreparedChunk(input: {
  images: PreparedImage[];
  categories: string[];
  fallbackCategory: string;
  provider: ProviderName;
  send: (images: PreparedImage[]) => Promise<CategorizationEntry[]>;
  log: LogFn;
  checkpoint: CheckpointFn;
  step?: NodeStepRunner;
}): Promise<CategoryPatch[]> {
  await input.checkpoint();
  try {
    const categorizations = await input.send(input.images);
    return normalizeCategorizationEntries({
      entries: categorizations,
      images: input.images,
      categories: input.categories,
      fallbackCategory: input.fallbackCategory,
    });
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
          `${input.provider} could not categorize a ${input.images.length}-image batch (${reason}); splitting it into smaller batches.`,
        );
        const midpoint = Math.ceil(input.images.length / 2);
        const left = await categorizePreparedChunk({
          ...input,
          images: input.images.slice(0, midpoint),
        });
        const right = await categorizePreparedChunk({
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
        `Categorizing image ${input.images[0].sourceIndex + 1} failed: ${reason}`,
      );
      return [
        {
          sourceIndex: input.images[0].sourceIndex,
          category: input.fallbackCategory,
          reason,
          categorized: false,
        },
      ];
    }

    const reason = compactReason(err instanceof Error ? err.message : String(err));
    const indexes = input.images
      .map((image) => image.sourceIndex + 1)
      .join(", ");
    await writeLog(
      input.log,
      `Categorizing image(s) ${indexes} failed: ${reason}. Marking them uncategorized and continuing.`,
    );
    return input.images.map((image) => ({
      sourceIndex: image.sourceIndex,
      category: input.fallbackCategory,
      reason,
      categorized: false,
    }));
  }
}

async function categorizePreparedImages(input: {
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  provider: ProviderName;
  categories: string[];
  fallbackCategory: string;
  send: (images: PreparedImage[]) => Promise<CategorizationEntry[]>;
  log: LogFn;
  checkpoint: CheckpointFn;
  step?: NodeStepRunner;
}): Promise<CategoryPatch[]> {
  const chunks = chunkArray(input.preparedImages, input.imagesPerCall);
  await writeLog(
    input.log,
    `Categorizing ${input.preparedImages.length} prepared image(s) in ${chunks.length} ${input.provider} call(s), up to ${input.concurrentCalls} call(s) at once.`,
  );

  const chunkResults = await mapWithConcurrency(
    chunks,
    input.concurrentCalls,
    (images, chunkIndex) => {
      const categorize = () => categorizePreparedChunk({ ...input, images });
      return input.step
        ? input.step(`categorize:${chunkIndex}`, categorize)
        : categorize();
    },
  );
  return chunkResults.flat();
}

async function categorizeWithOpenAI(input: {
  config: Record<string, unknown>;
  model: string;
  systemPrompt: string;
  prompt: string;
  categories: string[];
  fallbackCategory: string;
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  responseFormat: ResponseFormat;
  log: LogFn;
  checkpoint: CheckpointFn;
  step?: NodeStepRunner;
}): Promise<CategoryPatch[]> {
  return categorizePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "OpenAI",
    categories: input.categories,
    fallbackCategory: input.fallbackCategory,
    log: input.log,
    checkpoint: input.checkpoint,
    step: input.step,
    send: async (images) => {
      const res = await sendOpenAIChatCompletion({
        config: input.config,
        model: input.model,
        messages: buildMessages({
          systemPrompt: input.systemPrompt,
          prompt: input.prompt,
          categories: input.categories,
          images,
        }),
        responseFormat: input.responseFormat,
      });
      return parseCategorizationResponse(res, "OpenAI");
    },
  });
}

async function categorizeWithAzure(input: {
  config: Record<string, unknown>;
  deploymentName: string;
  systemPrompt: string;
  prompt: string;
  categories: string[];
  fallbackCategory: string;
  preparedImages: PreparedImage[];
  imagesPerCall: number;
  concurrentCalls: number;
  responseFormat: ResponseFormat;
  log: LogFn;
  checkpoint: CheckpointFn;
  step?: NodeStepRunner;
}): Promise<CategoryPatch[]> {
  return categorizePreparedImages({
    preparedImages: input.preparedImages,
    imagesPerCall: input.imagesPerCall,
    concurrentCalls: input.concurrentCalls,
    provider: "Azure",
    categories: input.categories,
    fallbackCategory: input.fallbackCategory,
    log: input.log,
    checkpoint: input.checkpoint,
    step: input.step,
    send: async (images) => {
      const res = await sendAzureChatCompletion({
        config: input.config,
        deploymentName: input.deploymentName,
        messages: buildMessages({
          systemPrompt: input.systemPrompt,
          prompt: input.prompt,
          categories: input.categories,
          images,
        }),
        responseFormat: input.responseFormat,
      });
      return parseCategorizationResponse(res, "Azure");
    },
  });
}

function applyCategoryPatches(
  categories: CategoryState[],
  patches: CategoryPatch[],
) {
  for (const patch of patches) {
    const current = categories[patch.sourceIndex];
    if (!current) continue;
    categories[patch.sourceIndex] = {
      ...current,
      category: patch.category,
      reason: patch.reason,
      categorized: patch.categorized,
      ...(patch.rawCategory ? { rawCategory: patch.rawCategory } : {}),
    };
  }
}

function categorizedImages(states: CategoryState[]) {
  return states.map((entry) => ({
    ...entry.candidate,
    category: entry.category,
    categoryReason: entry.reason,
    categorized: entry.categorized,
    sourceIndex: entry.sourceIndex,
    ...(entry.rawCategory ? { rawCategory: entry.rawCategory } : {}),
  }));
}

function groupedByCategory(
  categories: string[],
  categorized: ReturnType<typeof categorizedImages>,
) {
  return categories.map((category) => {
    const images = categorized.filter((image) => image.category === category);
    return {
      category,
      count: images.length,
      images,
      urls: images.map((image) => image.url),
    };
  });
}

export const categorizeImagesNode: NodeDefinition<CategorizeImagesConfig> = {
  ...categorizeImagesMeta,
  usesDurableSteps: true,

  async run(ctx) {
    const allCandidates = normalizeImageCandidates(
      ctx.inputs.images ?? ctx.inputs.candidates,
    );
    const checkpoint = ctx.throwIfStopped ?? noopCheckpoint;
    const categories = parseCategories(ctx.config.categories);

    if (categories.length === 0) {
      throw new Error("Add at least one category.");
    }

    const fallbackCategory = categories[0];

    if (allCandidates.length === 0) {
      await ctx.log("No images were available to categorize.");
      return {
        type: "output",
        outputs: {
          categorized: [],
          categorizedUrls: [],
          categoryGroups: groupedByCategory(categories, []),
          categorySummary: categories.map((category) => ({ category, count: 0 })),
          skipped: [],
          count: 0,
          categorizedCount: 0,
          skippedCount: 0,
        },
      };
    }

    const candidates = allCandidates.slice(0, ctx.config.maxImages);
    if (allCandidates.length > candidates.length) {
      await ctx.log(
        `Categorize Images received ${allCandidates.length} image(s); using the first ${candidates.length}.`,
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

    const states: CategoryState[] = candidates.map((candidate, sourceIndex) => ({
      candidate,
      sourceIndex,
      category: fallbackCategory,
      reason: "Image was not categorized.",
      categorized: false,
    }));

    await checkpoint();
    await ctx.log(
      `Preparing ${candidates.length} image(s) for vision categorization.`,
    );
    const prepared = await prepareProviderImages({
      candidates,
      purpose: "vision categorization",
      log: ctx.log,
      checkpoint,
    });
    for (const skipped of prepared.skipped) {
      states[skipped.sourceIndex] = {
        ...states[skipped.sourceIndex],
        reason: `Could not prepare image for vision categorization: ${skipped.reason}`,
        categorized: false,
      };
    }
    const preparedImages = prepared.preparedImages;

    if (preparedImages.length > 0) {
      await checkpoint();
      const responseFormat = jsonSchemaResponseFormat(
        "image_categorizations",
        responseSchemaForCategories(categories),
      );
      const patches =
        connection.type === "openai"
          ? await categorizeWithOpenAI({
              config: connection.config ?? {},
              model: ctx.config.model,
              systemPrompt: ctx.config.systemPrompt,
              prompt: ctx.config.prompt,
              categories,
              fallbackCategory,
              preparedImages,
              imagesPerCall: ctx.config.imagesPerCall,
              concurrentCalls: ctx.config.concurrentCalls,
              responseFormat,
              log: ctx.log,
              checkpoint,
              step: ctx.step,
            })
          : connection.type === "azure-foundry"
            ? await categorizeWithAzure({
                config: connection.config ?? {},
                deploymentName: ctx.config.model,
                systemPrompt: ctx.config.systemPrompt,
                prompt: ctx.config.prompt,
                categories,
                fallbackCategory,
                preparedImages,
                imagesPerCall: ctx.config.imagesPerCall,
                concurrentCalls: ctx.config.concurrentCalls,
                responseFormat,
                log: ctx.log,
                checkpoint,
                step: ctx.step,
              })
            : (() => {
                throw new Error(
                  `Unsupported AI connection type: ${connection.type}`,
                );
              })();
      applyCategoryPatches(states, patches);
    } else {
      await ctx.log("No images could be prepared for vision categorization.");
    }

    await checkpoint();
    const categorized = categorizedImages(states);
    const categoryGroups = groupedByCategory(categories, categorized);
    const skipped = categorized
      .filter((image) => image.categorized !== true)
      .map((image) => ({
        url: image.url,
        category: image.category,
        reason: image.categoryReason,
        sourceIndex: image.sourceIndex,
        ...(image.rawCategory ? { rawCategory: image.rawCategory } : {}),
      }));
    await ctx.log(
      `Categorized ${categorized.length} image(s); ${categorized.length - skipped.length} received model categories.`,
    );

    return {
      type: "output",
      outputs: {
        categorized,
        categorizedUrls: categorized.map((candidate) => candidate.url),
        categoryGroups,
        categorySummary: categoryGroups.map((group) => ({
          category: group.category,
          count: group.count,
        })),
        skipped,
        count: categorized.length,
        categorizedCount: categorized.length - skipped.length,
        skippedCount: skipped.length,
      },
    };
  },
};
