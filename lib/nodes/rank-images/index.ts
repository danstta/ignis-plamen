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
  return Array.isArray(raw) ? raw.filter(isImageCandidate) : [];
}

function buildMessages(
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
): { role: "user"; content: unknown[] }[] {
  const content: unknown[] = [
    {
      type: "text",
      text:
        `Rank these ${candidates.length} candidate photos for the location "${location}".\n` +
        `Criteria: ${criteria}\n` +
        `Each image is given in order, index 0..${candidates.length - 1}. ` +
        `Return a ranking where a higher score is a better fit.`,
    },
    ...candidates.map((c) => ({
      type: "image_url",
      image_url: { url: c.url },
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
): Promise<RankingEntry[]> {
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
      messages: buildMessages(criteria, location, candidates),
      response_format: responseFormat,
    }),
  });
  return parseRankingResponse(res, "OpenAI");
}

async function rankWithAzure(
  config: Record<string, unknown>,
  deploymentName: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
): Promise<RankingEntry[]> {
  const endpoint = String(config.endpoint ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(config.apiKey ?? "").trim();
  const apiVersion = String(config.apiVersion || "2025-01-01-preview").trim();

  if (!endpoint) throw new Error("Azure connection is missing an endpoint.");
  if (!apiKey) throw new Error("Azure connection is missing an API key.");
  if (!deploymentName) {
    throw new Error("Azure connection is missing a deployment name.");
  }

  const url =
    `${endpoint}/openai/deployments/${encodeURIComponent(deploymentName)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: buildMessages(criteria, location, candidates),
      response_format: responseFormat,
    }),
  });
  return parseRankingResponse(res, "Azure");
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

    let ranked: ImageCandidate[];
    try {
      const connection = await getConnection(ctx.config.connectionId);
      if (!connection) throw new Error("Select an AI connection.");

      const configuredModels = modelOptionsForConnection({
        type: connection.type,
        config: connection.config ?? {},
      });
      if (
        !configuredModels.some((option) => option.value === ctx.config.model)
      ) {
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
              )
            : (() => {
                throw new Error(
                  `Unsupported AI connection type: ${connection.type}`,
                );
              })();
      ranked = ranking
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((r) => candidates[r.index])
        .filter((c): c is ImageCandidate => Boolean(c));
      // Append any candidates the model omitted so nothing is lost.
      for (const c of candidates) if (!ranked.includes(c)) ranked.push(c);
    } catch (err) {
      ctx.log(
        `Ranking failed, using search order: ${err instanceof Error ? err.message : err}`,
      );
      ranked = candidates;
    }

    return {
      type: "output",
      outputs: { ranked, best: ranked[0]?.url ?? "" },
    };
  },
};
