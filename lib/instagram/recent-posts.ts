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
  };
};

export function normalizeInstagramUsername(value: string): string | null {
  const username = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return null;
  return username;
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

  const accessToken = instagramAccessToken();
  const businessAccountId = instagramBusinessAccountId();
  if (!accessToken || !businessAccountId) {
    throw new Error(
      "Instagram preview needs INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.",
    );
  }

  const fields = [
    `business_discovery.username(${normalized})`,
    "{media.limit(8){id,media_type,media_url,thumbnail_url,permalink,timestamp,caption}}",
  ].join("");
  const url = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(businessAccountId)}`,
  );
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as
    | BusinessDiscoveryResponse
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
        `Instagram returned ${response.status} ${response.statusText}`,
    );
  }

  const media = data?.business_discovery?.media?.data;
  if (!Array.isArray(media)) return [];
  return media.flatMap((item) => {
    const post = toPost(item);
    return post ? [post] : [];
  });
}
