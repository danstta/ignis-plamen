import type { ImageCandidate, NodeDefinition, NodeRunContext } from "../types";
import { pexelsApiKey } from "@/lib/env";
import {
  type GooglePlace,
  type GooglePlacePhoto,
  signedGooglePlacePhotoUrl,
  textSearchGooglePlaces,
} from "@/lib/location-images/google-places";
import {
  findLocationImagesMeta,
  MAX_LOCATION_IMAGE_QUERIES,
  type FindLocationImagesConfig,
} from "./meta";

/**
 * Finds real photos of a project location through location-aware providers:
 *   1. Geocode the location text with OpenStreetMap Nominatim.
 *   2. Search Google Places photos when enabled.
 *   3. Search nearby geotagged Wikimedia Commons files when enabled.
 *   4. Search Openverse's open-licensed catalog when enabled.
 *   5. Search Pexels for polished poster-style travel photos when enabled.
 *   6. Fall back to text search for non-strict providers only.
 */
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const OPENVERSE_IMAGES = "https://api.openverse.org/v1/images/";
const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";
// Wikimedia geosearch silently returns no pages above its 10km radius cap.
const SEARCH_RADIUS_METERS = 10_000;

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
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

interface OpenverseImage {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  foreign_landing_url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  provider?: string;
  source?: string;
  attribution?: string;
  mature?: boolean;
  width?: number;
  height?: number;
}

interface OpenverseResponse {
  results?: OpenverseImage[];
}

interface PexelsPhotoSource {
  original?: string;
  large2x?: string;
  large?: string;
  landscape?: string;
  medium?: string;
}

interface PexelsPhoto {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  alt?: string;
  src?: PexelsPhotoSource;
}

interface PexelsResponse {
  photos?: PexelsPhoto[];
}

type SearchContext = Pick<
  NodeRunContext<FindLocationImagesConfig>,
  "config" | "inputs" | "trigger" | "log"
>;

interface QueryImageResult {
  query: string;
  candidates: ImageCandidate[];
}

async function geocodeLocation(
  query: string,
): Promise<NominatimPlace | undefined> {
  const url = new URL(NOMINATIM_SEARCH);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
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

async function searchOpenverse(
  query: string,
  limit: number,
): Promise<OpenverseImage[]> {
  const url = new URL(OPENVERSE_IMAGES);
  url.search = new URLSearchParams({
    q: query,
    page_size: String(limit),
    license_type: "commercial,modification",
  }).toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Openverse images ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as OpenverseResponse;
  return json.results ?? [];
}

async function searchPexels(
  query: string,
  limit: number,
): Promise<PexelsPhoto[]> {
  const key = pexelsApiKey();
  if (!key) {
    throw new Error(
      "Pexels provider requires PEXELS_API_KEY. Add it to .env.local or choose another provider.",
    );
  }

  const url = new URL(PEXELS_SEARCH);
  url.search = new URLSearchParams({
    query,
    orientation: "landscape",
    size: "large",
    per_page: String(Math.min(Math.max(limit, 1), 80)),
  }).toString();

  const res = await fetch(url, {
    headers: {
      Authorization: key,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Pexels search ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as PexelsResponse;
  return json.photos ?? [];
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

function toOpenverseCandidate(image: OpenverseImage): ImageCandidate | undefined {
  const url = image.url ?? image.thumbnail;
  if (!url || image.mature) return undefined;

  const provider = humanizeProvider(image.provider ?? image.source ?? "Openverse");
  const license = [image.license, image.license_version].filter(Boolean).join(" ");
  const attribution =
    image.attribution ??
    [image.creator, license, provider].filter(Boolean).join(" | ");

  return {
    url,
    attribution,
    widthPx: image.width,
    heightPx: image.height,
    title: image.title,
    source: provider === "Openverse" ? "Openverse" : `Openverse / ${provider}`,
    license,
    licenseUrl: image.license_url,
    attributionUrl: image.foreign_landing_url,
  };
}

function pexelsPhotoUrl(photo: PexelsPhoto, maxWidthPx: number): string | undefined {
  if (maxWidthPx >= 1800) {
    return photo.src?.large2x ?? photo.src?.original ?? photo.src?.large;
  }
  if (maxWidthPx >= 1100) {
    return photo.src?.landscape ?? photo.src?.large ?? photo.src?.large2x;
  }
  return photo.src?.large ?? photo.src?.landscape ?? photo.src?.medium;
}

function toPexelsCandidate(
  photo: PexelsPhoto,
  maxWidthPx: number,
): ImageCandidate | undefined {
  const url = pexelsPhotoUrl(photo, maxWidthPx);
  if (!url) return undefined;

  const title = photo.alt?.trim() || undefined;
  const attribution = photo.photographer
    ? `Photo by ${photo.photographer} on Pexels`
    : "Photo provided by Pexels";

  return {
    url,
    attribution,
    widthPx: photo.width,
    heightPx: photo.height,
    title,
    source: "Pexels",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    attributionUrl: photo.url ?? photo.photographer_url,
  };
}

function googlePhotoAttribution(photo: GooglePlacePhoto): string {
  const authors = photo.authorAttributions
    ?.map((author) => author.displayName?.trim())
    .filter((name): name is string => Boolean(name));
  return [...(authors ?? []), "Google Places"].join(" | ") || "Google Places";
}

function toGooglePlaceCandidates(
  place: GooglePlace,
  maxCandidates: number,
  maxWidthPx: number,
): ImageCandidate[] {
  const placeName =
    place.displayName?.text?.trim() || place.formattedAddress?.trim() || "Place";

  return (place.photos ?? [])
    .flatMap((photo): ImageCandidate[] => {
      if (!photo.name) return [];
      return [
        {
          url: signedGooglePlacePhotoUrl({
            name: photo.name,
            maxWidthPx,
          }),
          attribution: googlePhotoAttribution(photo),
          widthPx: photo.widthPx,
          heightPx: photo.heightPx,
          title: `${placeName} photo`,
          source: "Google Places",
          license: "Google Maps Platform Places API",
          attributionUrl:
            photo.authorAttributions?.find((author) => author.uri)?.uri ??
            place.googleMapsUri,
        },
      ];
    })
    .slice(0, maxCandidates);
}

function isCandidate(candidate: ImageCandidate | undefined): candidate is ImageCandidate {
  return Boolean(candidate);
}

function humanizeProvider(value: string): string {
  if (value.toLowerCase() === "wikimedia") return "Wikimedia Commons";
  if (value.toLowerCase() === "flickr") return "Flickr";
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function uniqueCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  const unique: ImageCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.attributionUrl ?? candidate.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function configuredLocationQueries(config: FindLocationImagesConfig): string[] {
  return uniqueText([
    ...config.locationQueries,
    config.locationQuery,
  ]).slice(0, MAX_LOCATION_IMAGE_QUERIES);
}

function uniqueText(values: unknown[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const text = stringValue(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }
  return unique;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function triggerBodyLocation(trigger: Record<string, unknown>): string {
  const body = trigger.body;
  if (body === null || typeof body !== "object") return "";
  return stringValue((body as Record<string, unknown>).location);
}

function destinationName(place: NominatimPlace | undefined): string | undefined {
  const address = place?.address;
  if (!address) return undefined;
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    address.state;
  return [locality, address.country].filter(Boolean).join(", ") || undefined;
}

function pexelsQueries(
  location: string,
  place: NominatimPlace | undefined,
): string[] {
  const destination = destinationName(place);
  return [
    destination,
    destination ? `${destination} cityscape landmark aerial view` : undefined,
    `${location} travel landmark cityscape`,
    location,
  ].filter(
    (query, index, all): query is string =>
      typeof query === "string" &&
      query.trim() !== "" &&
      all.indexOf(query) === index,
  );
}

function withLocationQuery(
  candidates: ImageCandidate[],
  query: string,
  queryIndex: number,
): ImageCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    locationQuery: query,
    locationQueryIndex: queryIndex,
  }));
}

async function searchOneLocation(
  ctx: SearchContext,
  location: string,
  queryIndex: number,
): Promise<QueryImageResult> {
  const selectedProviders = new Set(ctx.config.providers);
  const resultsPerProvider = ctx.config.resultsPerProvider;
  const searchLimit = Math.min(Math.max(resultsPerProvider * 4, 10), 50);
  const candidates: ImageCandidate[] = [];
  let googlePlace: GooglePlace | undefined;

  const addProviderCandidates = (providerCandidates: ImageCandidate[]) => {
    candidates.push(
      ...uniqueCandidates(providerCandidates).slice(0, resultsPerProvider),
    );
  };

  if (selectedProviders.has("google-places")) {
    googlePlace = await textSearchGooglePlaces(location);
    if (googlePlace) {
      await ctx.log(
        `Google Places matched "${location}" to ${
          googlePlace.displayName?.text ??
          googlePlace.formattedAddress ??
          googlePlace.id ??
          "a place"
        }`,
      );
      addProviderCandidates(
        toGooglePlaceCandidates(
          googlePlace,
          resultsPerProvider,
          ctx.config.maxWidthPx,
        ),
      );
    } else {
      await ctx.log(`Google Places found no place for "${location}"`);
    }
  }

  const needsGeocode =
    selectedProviders.has("wikimedia") ||
    selectedProviders.has("openverse") ||
    selectedProviders.has("pexels");
  const place = needsGeocode ? await geocodeLocation(location) : undefined;
  if (place) {
    await ctx.log(
      `geocoded "${location}" to ${
        place.display_name ?? `${place.lat}, ${place.lon}`
      }`,
    );
    if (selectedProviders.has("wikimedia")) {
      const googleLat = googlePlace?.location?.latitude;
      const googleLon = googlePlace?.location?.longitude;
      const nearbyPages = await searchNearbyCommons(
        Number.isFinite(googleLat) ? String(googleLat) : place.lat,
        Number.isFinite(googleLon) ? String(googleLon) : place.lon,
        searchLimit,
        ctx.config.maxWidthPx,
      );
      const wikimediaCandidates = nearbyPages.map(toCandidate).filter(isCandidate);
      if (wikimediaCandidates.length < resultsPerProvider) {
        const textPages = await searchCommonsText(
          place.display_name ?? location,
          searchLimit,
          ctx.config.maxWidthPx,
        );
        wikimediaCandidates.push(...textPages.map(toCandidate).filter(isCandidate));
      }
      addProviderCandidates(wikimediaCandidates);
    }
  } else if (needsGeocode) {
    await ctx.log(`could not geocode "${location}", using text search only`);
  }

  const textQueries = uniqueText([location, place?.display_name]);

  if (selectedProviders.has("wikimedia") && !place) {
    const wikimediaCandidates: ImageCandidate[] = [];
    for (const query of textQueries) {
      const textPages = await searchCommonsText(
        query,
        searchLimit,
        ctx.config.maxWidthPx,
      );
      wikimediaCandidates.push(...textPages.map(toCandidate).filter(isCandidate));
      if (uniqueCandidates(wikimediaCandidates).length >= resultsPerProvider) break;
    }
    addProviderCandidates(wikimediaCandidates);
  }

  if (selectedProviders.has("pexels")) {
    const pexelsCandidates: ImageCandidate[] = [];
    for (const query of pexelsQueries(location, place)) {
      pexelsCandidates.push(
        ...(await searchPexels(query, searchLimit))
          .map((photo) => toPexelsCandidate(photo, ctx.config.maxWidthPx))
          .filter(isCandidate),
      );
      if (uniqueCandidates(pexelsCandidates).length >= resultsPerProvider) break;
    }
    addProviderCandidates(pexelsCandidates);
  }

  if (selectedProviders.has("openverse")) {
    const openverseCandidates: ImageCandidate[] = [];
    for (const query of textQueries) {
      openverseCandidates.push(
        ...(await searchOpenverse(query, searchLimit))
          .map(toOpenverseCandidate)
          .filter(isCandidate),
      );
      if (uniqueCandidates(openverseCandidates).length >= resultsPerProvider) break;
    }
    addProviderCandidates(openverseCandidates);
  }

  return {
    query: location,
    candidates: withLocationQuery(
      uniqueCandidates(candidates),
      location,
      queryIndex,
    ),
  };
}

export const findLocationImagesNode: NodeDefinition<FindLocationImagesConfig> = {
  ...findLocationImagesMeta,

  async run(ctx) {
    const locations = configuredLocationQueries(ctx.config);
    if (locations.length === 0) {
      const fallback =
        stringValue(ctx.inputs.location) || triggerBodyLocation(ctx.trigger);
      if (fallback) locations.push(fallback);
    }
    if (locations.length === 0) throw new Error("No location provided to search");

    const queryResults: QueryImageResult[] = [];
    for (const [index, location] of locations.entries()) {
      await ctx.log(`Searching location query ${index + 1}/${locations.length}: "${location}"`);
      queryResults.push(await searchOneLocation(ctx, location, index));
    }

    const selected = uniqueCandidates(
      queryResults.flatMap((result) => result.candidates),
    );
    if (selected.length === 0) {
      ctx.log(`No reusable photos found for ${locations.length} location query(s)`);
    }

    return {
      type: "output",
      outputs: {
        candidates: selected,
        queryResults,
      },
    };
  },
};
