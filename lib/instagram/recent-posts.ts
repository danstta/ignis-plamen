import {
  instagramAccessToken,
  instagramBusinessAccountId,
} from "@/lib/env";

export type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink?: string;
  mediaType?: string;
  timestamp?: string;
  caption?: string;
};

type GraphMedia = {
  id?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  thumbnail_url?: unknown;
  permalink?: unknown;
  timestamp?: unknown;
  caption?: unknown;
};

type BusinessDiscoveryResponse = {
  business_discovery?: {
    media?: {
      data?: GraphMedia[];
    };
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class InstagramPreviewError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "InstagramPreviewError";
  }
}

export function normalizeInstagramUsername(value: string): string | null {
  const username = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
  return username;
}

function stripMatchingQuotes(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  if (
    value.length >= 2 &&
    ((first === '"' && last === '"') || (first === "'" && last === "'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function extractAccessToken(value: string): string {
  let token = stripMatchingQuotes(value.trim());

  if (/^bearer\s+/i.test(token)) {
    token = token.replace(/^bearer\s+/i, "").trim();
  }

  if (token.includes("access_token=")) {
    const query = token.includes("?") ? token.split("?").at(-1) : token;
    const parsed = new URLSearchParams(query);
    token = parsed.get("access_token")?.trim() ?? token;
  }

  return stripMatchingQuotes(token);
}

function requireInstagramConfig(): {
  accessToken: string;
  businessAccountId: string;
} {
  const rawAccessToken = instagramAccessToken();
  const businessAccountId = instagramBusinessAccountId();
  if (!rawAccessToken || !businessAccountId) {
    throw new InstagramPreviewError(
      "Instagram preview needs INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.",
      500,
    );
  }

  const accessToken = extractAccessToken(rawAccessToken);
  if (!accessToken || /\s/.test(accessToken)) {
    throw new InstagramPreviewError(
      "INSTAGRAM_ACCESS_TOKEN must contain only the token value, with no spaces, quotes, or pasted URL/query wrappers.",
      500,
    );
  }

  return { accessToken, businessAccountId };
}

function formatGraphError(
  data: BusinessDiscoveryResponse | null,
  response: Response,
): string {
  const message =
    data?.error?.message ??
    `Instagram returned ${response.status} ${response.statusText}`;

  if (/cannot parse access token/i.test(message)) {
    return [
      "Meta could not parse INSTAGRAM_ACCESS_TOKEN.",
      "Use only the raw token value, and make sure it is a Meta/Facebook Graph API token for Instagram Business Discovery, not an Instagram Login token.",
    ].join(" ");
  }

  const trace = data?.error?.fbtrace_id
    ? ` Meta trace: ${data.error.fbtrace_id}.`
    : "";
  return `${message}${trace}`;
}

function graphString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPost(media: GraphMedia): InstagramPost | null {
  const id = graphString(media.id);
  const imageUrl = graphString(media.media_url) ?? graphString(media.thumbnail_url);
  if (!id || !imageUrl) return null;

  return {
    id,
    imageUrl,
    mediaType: graphString(media.media_type),
    permalink: graphString(media.permalink),
    timestamp: graphString(media.timestamp),
    caption: graphString(media.caption),
  };
}

export async function fetchInstagramRecentPosts(
  username: string,
): Promise<InstagramPost[]> {
  const normalized = normalizeInstagramUsername(username);
  if (!normalized) {
    throw new Error("Use a valid Instagram username.");
  }

  const { accessToken, businessAccountId } = requireInstagramConfig();

  const fields = [
    `business_discovery.username(${normalized})`,
    "{media.limit(8){id,media_type,media_url,thumbnail_url,permalink,timestamp,caption}}",
  ].join("");
  const url = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(businessAccountId)}`,
  );
  url.searchParams.set("fields", fields);

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => null)) as
    | BusinessDiscoveryResponse
    | null;

  if (!response.ok) {
    throw new InstagramPreviewError(formatGraphError(data, response));
  }

  const media = data?.business_discovery?.media?.data;
  if (!Array.isArray(media)) return [];
  return media.flatMap((item) => {
    const post = toPost(item);
    return post ? [post] : [];
  });
}
