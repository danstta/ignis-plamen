import { openaiApiKey } from "@/lib/env";
import type { ImageCandidate, NodeDefinition } from "../types";
import { rankImagesMeta, type RankImagesConfig } from "./meta";

/**
 * Ranks candidate images with OpenAI GPT vision. Sends every candidate URL plus
 * the location + criteria, and asks for a structured ranking (json_schema) so we
 * get a deterministic ordered list back. Outputs the sorted list and the best url.
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

async function rankWithOpenAI(
  model: string,
  criteria: string,
  location: string,
  candidates: ImageCandidate[],
): Promise<RankingEntry[]> {
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

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_ranking",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as { ranking?: RankingEntry[] };
  return parsed.ranking ?? [];
}

export const rankImagesNode: NodeDefinition<RankImagesConfig> = {
  ...rankImagesMeta,

  async run(ctx) {
    const candidates = (ctx.inputs.candidates ?? []) as ImageCandidate[];
    const location = String(ctx.inputs.location ?? "");

    if (candidates.length === 0) {
      return { type: "output", outputs: { ranked: [], best: "" } };
    }

    let ranked: ImageCandidate[];
    try {
      const ranking = await rankWithOpenAI(
        ctx.config.model,
        ctx.config.criteria,
        location,
        candidates,
      );
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
