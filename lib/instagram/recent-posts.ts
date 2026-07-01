import { instagramPreviewPostUrls } from "@/lib/env";

export type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink?: string;
  mediaType?: string;
  timestamp?: string;
  caption?: string;
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

function configuredPostUrls(): string[] {
  return (
    instagramPreviewPostUrls()
      ?.split(/[\n,]/)
      .map((url) => url.trim())
      .filter(Boolean)
      .filter((url) => {
        if (url.startsWith("/") || url.startsWith("data:image/")) return true;
        try {
          const parsed = new URL(url);
          return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch {
          return false;
        }
      }) ?? []
  );
}

function hash(input: string): number {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) % 360;
  }
  return value;
}

function mockPostImage(username: string, index: number): string {
  const hue = (hash(username) + index * 37) % 360;
  const nextHue = (hue + 78) % 360;
  const label = `@${username}`;
  const number = String(index + 1).padStart(2, "0");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 68% 42%)"/>
      <stop offset="1" stop-color="hsl(${nextHue} 78% 54%)"/>
    </linearGradient>
    <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M72 0H0v72" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#grid)"/>
  <circle cx="860" cy="210" r="172" fill="rgba(255,255,255,.18)"/>
  <circle cx="196" cy="812" r="248" fill="rgba(0,0,0,.16)"/>
  <rect x="96" y="740" width="888" height="208" rx="36" fill="rgba(0,0,0,.34)"/>
  <text x="132" y="832" fill="white" font-family="Arial, sans-serif" font-size="50" font-weight="700">${label}</text>
  <text x="132" y="896" fill="rgba(255,255,255,.78)" font-family="Arial, sans-serif" font-size="34">mock grid post ${number}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mockPosts(username: string): InstagramPost[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `mock-${username}-${index + 1}`,
    imageUrl: mockPostImage(username, index),
    mediaType: "IMAGE",
    caption: `Mock grid post ${index + 1}`,
  }));
}

export async function fetchInstagramRecentPosts(
  username: string,
): Promise<InstagramPost[]> {
  const normalized = normalizeInstagramUsername(username);
  if (!normalized) {
    throw new InstagramPreviewError("Use a valid Instagram username.", 400);
  }

  const urls = configuredPostUrls();
  if (urls.length > 0) {
    return urls.slice(0, 8).map((imageUrl, index) => ({
      id: `configured-${index + 1}`,
      imageUrl,
      mediaType: "IMAGE",
      caption: `Configured grid post ${index + 1}`,
    }));
  }

  return mockPosts(normalized);
}
