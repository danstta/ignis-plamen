/**
 * Minimal Tally REST client shared by the Tally nodes. Server-only: callers
 * hold an API key loaded from a `tally` connection.
 * API reference: https://developers.tally.so
 */

const TALLY_API_BASE = "https://api.tally.so";

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
  const res = await fetch(`${TALLY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

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
    body: JSON.stringify(input),
  });
}
