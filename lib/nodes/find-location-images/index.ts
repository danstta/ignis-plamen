import { googleMapsApiKey } from "@/lib/env";
import { storage } from "@/lib/storage";
import type { ImageCandidate, NodeDefinition } from "../types";
import { findLocationImagesMeta, type FindLocationImagesConfig } from "./meta";

/**
 * Finds real photos of a place using the NEW Google Places API:
 *   1. Text Search (places:searchText) — the X-Goog-FieldMask header is MANDATORY.
 *   2. Photo media — each photo comes back as a resource `name`
 *      (places/PID/photos/REF), fetched at v1/{name}/media.
 * Google media URLs are short-lived/key-bound, so we re-host the bytes via the
 * storage adapter to get stable URLs for GPT vision + Satori downstream.
 */
const PLACES_API = "https://places.googleapis.com/v1";

interface PlacePhoto {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string }[];
}

async function textSearch(
  key: string,
  textQuery: string,
): Promise<{ photos?: PlacePhoto[] } | undefined> {
  const res = await fetch(`${PLACES_API}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
    },
    body: JSON.stringify({ textQuery }),
  });
  if (!res.ok) {
    throw new Error(`Places searchText ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { places?: { photos?: PlacePhoto[] }[] };
  return json.places?.[0];
}

async function fetchPhotoBytes(
  key: string,
  photoName: string,
  maxWidthPx: number,
): Promise<{ bytes: Buffer; contentType: string }> {
  // fetch follows the redirect to the underlying image automatically.
  const res = await fetch(
    `${PLACES_API}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${key}`,
  );
  if (!res.ok) {
    throw new Error(`Places photo media ${res.status}: ${await res.text()}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  return { bytes, contentType };
}

export const findLocationImagesNode: NodeDefinition<FindLocationImagesConfig> = {
  ...findLocationImagesMeta,

  async run(ctx) {
    const location = String(ctx.inputs.location ?? "").trim();
    if (!location) throw new Error("No location provided to search");

    const key = googleMapsApiKey();
    const place = await textSearch(key, location);
    const photos = (place?.photos ?? []).slice(0, ctx.config.maxCandidates);
    if (photos.length === 0) {
      ctx.log(`No photos found for "${location}"`);
      return { type: "output", outputs: { candidates: [] } };
    }

    const candidates: ImageCandidate[] = [];
    for (const photo of photos) {
      if (!photo.name) continue;
      try {
        const { bytes, contentType } = await fetchPhotoBytes(
          key,
          photo.name,
          ctx.config.maxWidthPx,
        );
        const ext = contentType.includes("png") ? "png" : "jpg";
        const { url } = await storage().put(
          `places/${crypto.randomUUID()}.${ext}`,
          bytes,
          contentType,
        );
        candidates.push({
          url,
          attribution: (photo.authorAttributions ?? [])
            .map((a) => a.displayName ?? "")
            .filter(Boolean)
            .join(", "),
          widthPx: photo.widthPx,
          heightPx: photo.heightPx,
        });
      } catch (err) {
        ctx.log(
          `Photo fetch failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { type: "output", outputs: { candidates } };
  },
};
