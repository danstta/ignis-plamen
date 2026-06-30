import type { ImageCandidate, NodeDefinition } from "../types";
import { findLocationImagesMeta, type FindLocationImagesConfig } from "./meta";

/**
 * Finds real photos of a project location without paid map/photo APIs:
 *   1. Geocode the location text with OpenStreetMap Nominatim.
 *   2. Search nearby geotagged Wikimedia Commons files.
 *   3. Fall back to Commons text search when geocoding or geosearch is sparse.
 */
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
const SEARCH_RADIUS_METERS = 15_000;

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
}

interface CommonsMetadataValue {
  value?: string;
}

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  thumbwidth?: number;
  thumbheight?: number;
  mime?: string;
  extmetadata?: Record<string, CommonsMetadataValue>;
}

interface CommonsPage {
  title?: string;
  index?: number;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

async function geocodeLocation(
  query: string,
): Promise<NominatimPlace | undefined> {
  const url = new URL(NOMINATIM_SEARCH);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
  }).toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim search ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as NominatimPlace[];
  return json[0];
}

async function fetchCommons(params: URLSearchParams): Promise<CommonsPage[]> {
  const url = new URL(COMMONS_API);
  url.search = params.toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wikimedia Commons ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as CommonsResponse;
  return Object.values(json.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
}

function imageInfoParams(maxWidthPx: number): Record<string, string> {
  return {
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(maxWidthPx),
  };
}

async function searchNearbyCommons(
  lat: string,
  lon: string,
  limit: number,
  maxWidthPx: number,
): Promise<CommonsPage[]> {
  return fetchCommons(
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "geosearch",
      ggscoord: `${lat}|${lon}`,
      ggsradius: String(SEARCH_RADIUS_METERS),
      ggslimit: String(limit),
      ggsnamespace: "6",
      ...imageInfoParams(maxWidthPx),
    }),
  );
}

async function searchCommonsText(
  query: string,
  limit: number,
  maxWidthPx: number,
): Promise<CommonsPage[]> {
  return fetchCommons(
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: String(limit),
      ...imageInfoParams(maxWidthPx),
    }),
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metadata(
  info: CommonsImageInfo,
  key: string,
): string | undefined {
  const value = info.extmetadata?.[key]?.value;
  return value ? stripHtml(value) : undefined;
}

function toCandidate(page: CommonsPage): ImageCandidate | undefined {
  const info = page.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  if (!info || !url || !info.mime?.startsWith("image/")) return undefined;
  if (info.mime === "image/svg+xml") return undefined;

  const author =
    metadata(info, "Attribution") ??
    metadata(info, "Artist") ??
    metadata(info, "Credit");
  const license = metadata(info, "LicenseShortName") ?? metadata(info, "UsageTerms");
  const attribution = [author, license, "Wikimedia Commons"]
    .filter(Boolean)
    .join(" | ");

  return {
    url,
    attribution,
    widthPx: info.thumbwidth ?? info.width,
    heightPx: info.thumbheight ?? info.height,
    title: page.title?.replace(/^File:/, ""),
    source: "Wikimedia Commons",
    license,
    licenseUrl: metadata(info, "LicenseUrl"),
    attributionUrl: info.descriptionurl,
  };
}

function uniqueCandidates(pages: CommonsPage[]): ImageCandidate[] {
  const seen = new Set<string>();
  const candidates: ImageCandidate[] = [];
  for (const page of pages) {
    const candidate = toCandidate(page);
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    candidates.push(candidate);
  }
  return candidates;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function triggerBodyLocation(trigger: Record<string, unknown>): string {
  const body = trigger.body;
  if (body === null || typeof body !== "object") return "";
  return stringValue((body as Record<string, unknown>).location);
}

export const findLocationImagesNode: NodeDefinition<FindLocationImagesConfig> = {
  ...findLocationImagesMeta,

  async run(ctx) {
    const location =
      stringValue(ctx.config.locationQuery) ||
      stringValue(ctx.inputs.location) ||
      triggerBodyLocation(ctx.trigger);
    if (!location) throw new Error("No location provided to search");

    const searchLimit = Math.min(Math.max(ctx.config.maxCandidates * 4, 10), 50);
    const pages: CommonsPage[] = [];

    const place = await geocodeLocation(location);
    if (place) {
      ctx.log(
        `geocoded "${location}" to ${place.display_name ?? `${place.lat}, ${place.lon}`}`,
      );
      pages.push(
        ...(await searchNearbyCommons(
          place.lat,
          place.lon,
          searchLimit,
          ctx.config.maxWidthPx,
        )),
      );
    } else {
      ctx.log(`could not geocode "${location}", using Commons text search only`);
    }

    let candidates = uniqueCandidates(pages);
    if (candidates.length < ctx.config.maxCandidates) {
      pages.push(
        ...(await searchCommonsText(location, searchLimit, ctx.config.maxWidthPx)),
      );
      candidates = uniqueCandidates(pages);
    }

    const selected = candidates.slice(0, ctx.config.maxCandidates);
    if (selected.length === 0) {
      ctx.log(`No Wikimedia Commons photos found for "${location}"`);
    }

    return { type: "output", outputs: { candidates: selected } };
  },
};
