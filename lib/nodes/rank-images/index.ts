import { getConnection } from "@/lib/connections/service";
import { modelOptionsForConnection } from "@/lib/connections/model-options";
import type { ImageCandidate, NodeDefinition } from "../types";
import { rankImagesMeta, type RankImagesConfig } from "./meta";

/**
 * Ranks candidate images with a configured vision-capable AI connection. Sends
 * every candidate URL plus the location + criteria, and asks for a structured
 * ranking (json_schema) so we get a deterministic ordered list back.
 */
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

interface RankingEntry {
  index: number;
  score: number;
  reason: string;
}

interface RankingResult {
  ranking: RankingEntry[];
  candidates: ImageCandidate[];
}

const IMAGE_FETCH_USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
const MAX_AZURE_IMAGE_BYTES = 8 * 1024 * 1024;

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

function buildMessages(
  criteria: string,
  location: string,
  imageUrls: string[],
): { role: "user"; content: unknown[] }[] {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Rank these ${imageUrls.length} candidate photos for the location "${location}".\n` +
        `Criteria: ${criteria}\n` +
        `Each image is given in order, index 0..${imageUrls.length - 1}. ` +
        `Return a ranking where a higher score is a better fit.`,
    },
    ...imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  return [{ role: "user", content }];
}

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "image_ranking",
    strict: true,
    schema: responseSchema,
  },
} as const;

async function parseRankingResponse(res: Response, provider: string) {
  if (!res.ok) {
    throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as { ranking?: RankingEntry[] };
  return parsed.ranking ?? [];
}

async function rankWithOpenAI(
  config: Record<string, unknown>,
  model: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
): Promise<RankingResult> {
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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: buildMessages(
        criteria,
        location,
        candidates.map((candidate) => candidate.url),
      ),
      response_format: responseFormat,
    }),
  });
  return { ranking: await parseRankingResponse(res, "OpenAI"), candidates };
}

async function imageUrlToDataUrl(candidate: ImageCandidate): Promise<string> {
  const res = await fetch(candidate.url, {
    headers: {
      Accept: "image/*",
      "User-Agent": IMAGE_FETCH_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }

  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `expected image content-type, got "${contentType || "unknown"}"`,
    );
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AZURE_IMAGE_BYTES) {
    throw new Error(`image is ${contentLength} bytes`);
  }

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_AZURE_IMAGE_BYTES) {
    throw new Error(`image is ${bytes.byteLength} bytes`);
  }

  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function prepareAzureImages(
  candidates: ImageCandidate[],
  log: (message: string) => void,
): Promise<{ candidate: ImageCandidate; dataUrl: string }[]> {
  const settled = await Promise.allSettled(
    candidates.map(async (candidate) => ({
      candidate,
      dataUrl: await imageUrlToDataUrl(candidate),
    })),
  );

  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    const reason =
      result.reason instanceof Error ? result.reason.message : result.reason;
    log(
      `Skipping image candidate ${index} because it could not be prepared for Azure: ${reason}`,
    );
    return [];
  });
}

async function rankWithAzure(
  config: Record<string, unknown>,
  deploymentName: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
  log: (message: string) => void,
): Promise<RankingResult> {
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

  const preparedImages = await prepareAzureImages(candidates, log);
  if (preparedImages.length === 0) {
    throw new Error("No image candidates could be prepared for Azure vision.");
  }

  const body = {
    ...(usesUnifiedV1Endpoint ? { model: deploymentName } : {}),
    messages: buildMessages(
      criteria,
      location,
      preparedImages.map((image) => image.dataUrl),
    ),
    response_format: responseFormat,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  return {
    ranking: await parseRankingResponse(res, "Azure"),
    candidates: preparedImages.map((image) => image.candidate),
  };
}

export const rankImagesNode: NodeDefinition<RankImagesConfig> = {
  ...rankImagesMeta,

  async run(ctx) {
    const candidates = normalizeCandidates(ctx.inputs.candidates);
    const location = String(ctx.inputs.location ?? "");

    if (candidates.length === 0) {
      ctx.log("No image candidates were available to rank.");
      return { type: "output", outputs: { ranked: [], best: "" } };
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

    const ranking =
      connection.type === "openai"
        ? await rankWithOpenAI(
            connection.config ?? {},
            ctx.config.model,
            ctx.config.criteria,
            location,
            candidates,
          )
        : connection.type === "azure-foundry"
          ? await rankWithAzure(
              connection.config ?? {},
              ctx.config.model,
              ctx.config.criteria,
              location,
              candidates,
              ctx.log,
            )
          : (() => {
              throw new Error(
                `Unsupported AI connection type: ${connection.type}`,
              );
            })();
    const ranked = ranking.ranking
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((r) => ranking.candidates[r.index])
      .filter((c): c is ImageCandidate => Boolean(c));
    // Append any candidates the model omitted so nothing is lost.
    for (const c of candidates) if (!ranked.includes(c)) ranked.push(c);

    return {
      type: "output",
      outputs: { ranked, best: ranked[0]?.url ?? "" },
    };
  },
};
