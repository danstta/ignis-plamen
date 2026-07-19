import { getConnection } from "@/lib/connections/service";
import { valueToText } from "@/lib/workflows/references";
import type { NodeDefinition } from "@/lib/nodes/types";
import {
  createTallyForm,
  getTallyForm,
  tallyShareUrl,
  type TallyBlock,
} from "../../lib/api";
import { tallyCreateFormMeta, type TallyCreateFormConfig } from "./meta";

/**
 * Rewrites every block/group uuid to a fresh one so the copy shares nothing
 * with the template. Done as a whole-JSON string replacement because payloads
 * can reference other blocks' uuids (e.g. conditional-logic jump targets) and
 * those references must follow the same mapping.
 */
function cloneBlocksWithFreshUuids(blocks: TallyBlock[]): TallyBlock[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.uuid) ids.add(block.uuid);
    if (block.groupUuid) ids.add(block.groupUuid);
  }
  let json = JSON.stringify(blocks);
  for (const id of ids) {
    json = json.split(id).join(crypto.randomUUID());
  }
  return JSON.parse(json) as TallyBlock[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "{{ description }}" or "description" → "description". */
function normalizeToken(token: string): string {
  return token.replace(/^[{\s]+|[}\s]+$/g, "");
}

function replaceTokensDeep(
  value: unknown,
  patterns: { regex: RegExp; replacement: string }[],
  counts: Map<RegExp, number>,
): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const { regex, replacement } of patterns) {
      result = result.replace(regex, () => {
        counts.set(regex, (counts.get(regex) ?? 0) + 1);
        return replacement;
      });
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceTokensDeep(item, patterns, counts));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceTokensDeep(item, patterns, counts),
      ]),
    );
  }
  return value;
}

export const tallyCreateFormNode: NodeDefinition<TallyCreateFormConfig> = {
  ...tallyCreateFormMeta,

  async run(ctx) {
    const templateFormId = ctx.config.templateFormId.trim();
    if (!templateFormId) throw new Error("Template form ID is required");

    const connection = await getConnection(ctx.config.connectionId);
    if (!connection || connection.type !== "tally") {
      throw new Error("Select a valid Tally connection");
    }
    const apiKey = String(connection.config?.apiKey ?? "").trim();
    if (!apiKey) throw new Error("Tally connection is missing an API key");

    const template = await getTallyForm(apiKey, templateFormId);
    if (!template.blocks?.length) {
      throw new Error(`Template form ${templateFormId} has no blocks to copy`);
    }

    const blocks = cloneBlocksWithFreshUuids(template.blocks);

    const patterns = ctx.config.replacements.flatMap((row) => {
      const token = normalizeToken(row.token);
      if (!token) return [];
      return [
        {
          regex: new RegExp(`\\{\\{\\s*${escapeRegExp(token)}\\s*\\}\\}`, "g"),
          replacement: valueToText(row.value),
        },
      ];
    });
    const counts = new Map<RegExp, number>();
    for (const block of blocks) {
      block.payload = replaceTokensDeep(block.payload, patterns, counts) as Record<
        string,
        unknown
      >;
    }
    const replaced = [...counts.values()].reduce((sum, count) => sum + count, 0);
    if (patterns.length > 0) {
      await ctx.log(
        `filled ${replaced} placeholder occurrence(s) across ${patterns.length} token(s)`,
      );
      if (replaced === 0) {
        await ctx.log(
          "warning: no placeholders matched — check the {{tokens}} in the template form",
        );
      }
    }

    const formTitle = ctx.config.formTitle.trim();
    if (formTitle) {
      const titleBlock = blocks.find((block) => block.type === "FORM_TITLE");
      if (titleBlock) {
        titleBlock.payload = { ...titleBlock.payload, title: formTitle };
      } else {
        await ctx.log("warning: template has no FORM_TITLE block; form title not set");
      }
    }

    const status = ctx.config.publish ? "PUBLISHED" : "DRAFT";
    const created = await createTallyForm(apiKey, {
      status,
      blocks,
      workspaceId: template.workspaceId,
    });
    const formId = typeof created?.id === "string" ? created.id : "";
    if (!formId) {
      throw new Error("Tally did not return an id for the created form");
    }

    const url = tallyShareUrl(formId);
    await ctx.log(
      `created ${status.toLowerCase()} form ${formId} from template ${templateFormId} (${blocks.length} blocks)`,
    );

    return {
      type: "output",
      outputs: {
        formId,
        url,
        name:
          typeof created.name === "string" && created.name
            ? created.name
            : formTitle || (template.name ?? ""),
        form: created,
      },
    };
  },
};
