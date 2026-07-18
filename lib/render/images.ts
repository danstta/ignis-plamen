import {
  isPlaceholderImageValue,
  type CanvasView,
  type PlaceholderData,
} from "@/lib/editor/types";
import { readResponseWithLimit } from "@/lib/images/fetch";
import { normalizeImageForRender } from "@/lib/images/normalize";
import { resolveImageSrc } from "./element-style";

/**
 * Server-side image resolution for the Satori render path. Satori fetches
 * `<img src>` URLs itself and draws the raw bytes: EXIF orientation is ignored
 * (camera photos render rotated) and HEIC can't be decoded at all. Before a
 * canvas reaches Satori, every remote image it references is fetched here,
 * normalized upright via {@link normalizeImageForRender}, and swapped in as a
 * `data:` URI.
 *
 * Normalized images are cached in memory so re-rendering (the picker preview
 * re-renders every page on each selection change) doesn't re-download and
 * re-encode the same originals over and over.
 */

/** Remote originals above this are skipped (left as URLs for Satori to fetch). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MiB
const FETCH_TIMEOUT_MS = 15_000;
/** Bounded cache: entries are data URIs of ~0.1–2 MB each. */
const CACHE_MAX_ENTRIES = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { dataUri: Promise<string | null>; expires: number };
const cache = new Map<string, CacheEntry>();

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const read = await readResponseWithLimit(res, MAX_IMAGE_BYTES);
    if (!read.ok || read.bytes.byteLength === 0) return null;

    const normalized = await normalizeImageForRender({
      bytes: read.bytes,
      contentType: res.headers.get("content-type"),
      name: url,
    });
    if (!normalized.contentType.startsWith("image/")) return null;
    return `data:${normalized.contentType};base64,${normalized.bytes.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch-and-normalize with an in-flight-deduping cache: parallel page renders
 * of the same document share one download per image. Failures are not cached,
 * so a transient upstream error doesn't poison later renders.
 */
function cachedDataUri(url: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expires > now) return hit.dataUri;
  cache.delete(url);

  const dataUri = fetchAsDataUri(url).then((result) => {
    if (result === null) cache.delete(url);
    return result;
  });
  cache.set(url, { dataUri, expires: now + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return dataUri;
}

/**
 * Replace every remote image a canvas would render (element `src`s and bound
 * image placeholder values) with a normalized `data:` URI. Images that fail to
 * fetch or normalize keep their original URL — Satori's own fetch remains the
 * fallback, matching prior behavior.
 */
export async function inlineCanvasImages(
  canvas: CanvasView,
  data?: PlaceholderData,
): Promise<{ canvas: CanvasView; data?: PlaceholderData }> {
  const urls = new Set<string>();
  for (const el of canvas.elements) {
    if (el.type !== "image") continue;
    const src = resolveImageSrc(el, data);
    if (src && isRemoteUrl(src)) urls.add(src);
  }
  if (urls.size === 0) return { canvas, data };

  const inlined = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      const dataUri = await cachedDataUri(url);
      if (dataUri) inlined.set(url, dataUri);
    }),
  );
  if (inlined.size === 0) return { canvas, data };

  const elements = canvas.elements.map((el) => {
    if (el.type !== "image" || !el.src) return el;
    const dataUri = inlined.get(el.src);
    return dataUri ? { ...el, src: dataUri } : el;
  });

  let nextData = data;
  if (data) {
    // Only rewrite the placeholder keys image elements actually consume, so a
    // text element sharing a key never renders a giant data URI as its text.
    nextData = { ...data };
    for (const el of canvas.elements) {
      if (el.type !== "image" || !el.placeholderKey) continue;
      const value = data[el.placeholderKey];
      if (typeof value === "string") {
        const dataUri = inlined.get(value);
        if (dataUri) nextData[el.placeholderKey] = dataUri;
      } else if (isPlaceholderImageValue(value)) {
        const dataUri = inlined.get(value.url);
        if (dataUri) nextData[el.placeholderKey] = { ...value, url: dataUri };
      }
    }
  }

  return { canvas: { ...canvas, elements }, data: nextData };
}
