/**
 * Minimal Tally REST client shared by the Tally nodes. Server-only: callers
 * hold an API key loaded from a `tally` connection.
 * API reference: https://developers.tally.so
 */

const TALLY_API_BASE = "https://api.tally.so";
const TALLY_TIMEOUT_MS = 30_000;

export interface TallyBlock {
  uuid: string;
  type: string;
  groupUuid: string;
  groupType: string;
  payload: Record<string, unknown>;
}

export interface TallyForm {
  id: string;
  name?: string;
  workspaceId?: string;
  status?: string;
  blocks?: TallyBlock[];
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export type TallyFormStatus = "BLANK" | "DRAFT" | "PUBLISHED";

/** The public fill-out link for a form (live once the form is PUBLISHED). */
export function tallyShareUrl(formId: string): string {
  return `https://tally.so/r/${formId}`;
}

async function tallyRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${TALLY_API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(TALLY_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `Tally API request timed out after ${TALLY_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  }

  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : `${res.status} ${res.statusText}`;
    throw new Error(`Tally API request failed: ${message}`);
  }

  return body as T;
}

export function getTallyForm(apiKey: string, formId: string): Promise<TallyForm> {
  return tallyRequest<TallyForm>(apiKey, `/forms/${encodeURIComponent(formId)}`);
}

/**
 * Conforms a form read from `GET /forms/{id}` to what `POST /forms` accepts.
 *
 * Since API v0.4.0 the create/update endpoints validate block payloads against
 * a strict schema, while `GET` returns the builder's own state. Two kinds of
 * leftovers in that state are rejected with "Invalid block structure detected
 * for <TYPE>", and both mean the same thing in Tally's model as an absent key:
 *
 * 1. Disabled or optional features come back as `null` (e.g. `maxCharacters`,
 *    `columnRatio`, `name`, or `defaultAnswer` on a TEXTAREA). Those keys are
 *    typed non-nullable in the create schema, and `defaultAnswer`'s union
 *    admits no null at all.
 * 2. A value whose `hasX` gate is `false` keeps whatever it was last set to.
 *    Turning off a long answer's 200-character minimum in the builder leaves
 *    `{ hasMinCharacters: false, minCharacters: 200 }`, and the create schema
 *    only admits `minCharacters` when the gate is `true`. The same pairing
 *    covers `hasMaxCharacters`, `hasDefaultAnswer`, `hasMaxChoices` and every
 *    other `hasX`/`x` pair, so the gate is read off the payload rather than
 *    from a hardcoded list.
 *
 * Only the payload's own keys are stripped, never nested structures: some
 * nested fields are required yet nullable (a conditional-logic condition's
 * `value` is null for IS_EMPTY checks), and removing those would delete a
 * field the schema requires. No block payload has a top-level field that is
 * both required and nullable, so stripping top-level nulls is always safe.
 */
export function sanitizeBlocksForCreate(blocks: TallyBlock[]): TallyBlock[] {
  return blocks.map((block) => {
    const gatedOff = new Set<string>();
    for (const [key, value] of Object.entries(block.payload)) {
      if (value === false && /^has[A-Z]/.test(key)) {
        gatedOff.add(key[3].toLowerCase() + key.slice(4));
      }
    }
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block.payload)) {
      if (value === null || value === undefined) continue;
      if (gatedOff.has(key)) continue;
      payload[key] = value;
    }
    return { ...block, payload };
  });
}

export function createTallyForm(
  apiKey: string,
  input: {
    status: TallyFormStatus;
    blocks: TallyBlock[];
    workspaceId?: string;
    settings?: Record<string, unknown>;
  },
): Promise<TallyForm> {
  return tallyRequest<TallyForm>(apiKey, "/forms", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      blocks: sanitizeBlocksForCreate(input.blocks),
    }),
  });
}
