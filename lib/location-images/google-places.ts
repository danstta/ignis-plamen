import { createHmac, timingSafeEqual } from "crypto";
import { googleMapsApiKey, publicAppUrl, sessionSecret } from "@/lib/env";

const PLACES_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const PLACES_PHOTO_MEDIA_BASE = "https://places.googleapis.com/v1/";
const PHOTO_PROXY_PATH = "/api/location-images/google-photo";
const USER_AGENT = "Ignis/0.1 (https://github.com/danstta/ignis)";

export interface GooglePlacePhoto {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  }[];
}

export interface GooglePlace {
  id?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
  photos?: GooglePlacePhoto[];
}

interface GooglePlacesTextSearchResponse {
  places?: GooglePlace[];
}

interface GooglePlacePhotoMediaResponse {
  photoUri?: string;
}

export function googlePlacesKey(): string {
  const key = googleMapsApiKey();
  if (!key) {
    throw new Error(
      "Google Places provider requires GOOGLE_MAPS_API_KEY. Add it to .env.local or choose another provider.",
    );
  }
  return key;
}

function photoPayload(name: string, maxWidthPx: number): string {
  return `${name}\n${maxWidthPx}`;
}

export function signGooglePlacePhoto(name: string, maxWidthPx: number): string {
  return createHmac("sha256", sessionSecret())
    .update(photoPayload(name, maxWidthPx))
    .digest("base64url");
}

export function verifyGooglePlacePhotoSignature(
  name: string,
  maxWidthPx: number,
  signature: string,
): boolean {
  const expected = Buffer.from(signGooglePlacePhoto(name, maxWidthPx));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isGooglePlacePhotoName(name: string): boolean {
  return /^places\/[^/]+\/photos\/[^/]+$/.test(name);
}

function fallbackAppUrl(): string {
  return `http://localhost:${process.env.PORT?.trim() || "3000"}`;
}

export function signedGooglePlacePhotoUrl(input: {
  name: string;
  maxWidthPx: number;
}): string {
  const maxWidthPx = Math.trunc(input.maxWidthPx);
  const url = new URL(PHOTO_PROXY_PATH, publicAppUrl() ?? fallbackAppUrl());
  url.searchParams.set("name", input.name);
  url.searchParams.set("w", String(maxWidthPx));
  url.searchParams.set("sig", signGooglePlacePhoto(input.name, maxWidthPx));
  return url.toString();
}

export async function textSearchGooglePlaces(
  query: string,
): Promise<GooglePlace | undefined> {
  const res = await fetch(PLACES_TEXT_SEARCH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googlePlacesKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.photos.name,places.photos.widthPx,places.photos.heightPx,places.photos.authorAttributions",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Places text search ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as GooglePlacesTextSearchResponse;
  return json.places?.[0];
}

async function googlePhotoUri(name: string, maxWidthPx: number): Promise<string> {
  const url = new URL(`${PLACES_PHOTO_MEDIA_BASE}${name}/media`);
  url.searchParams.set("maxWidthPx", String(maxWidthPx));
  url.searchParams.set("skipHttpRedirect", "true");
  url.searchParams.set("key", googlePlacesKey());

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Google Place Photo media ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as GooglePlacePhotoMediaResponse;
  if (!json.photoUri) throw new Error("Google Place Photo did not return photoUri.");
  return json.photoUri;
}

export async function fetchGooglePlacePhoto(input: {
  name: string;
  maxWidthPx: number;
}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const photoUri = await googlePhotoUri(input.name, input.maxWidthPx);
  const res = await fetch(photoUri, {
    headers: {
      Accept: "image/*",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Google Place Photo bytes ${res.status}: ${await res.text()}`);
  }

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Google Place Photo returned ${contentType}, not an image.`);
  }

  return {
    bytes: await res.arrayBuffer(),
    contentType,
  };
}
