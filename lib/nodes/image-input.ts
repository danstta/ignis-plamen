import type { ImageCandidate } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function driveDirectLink(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function googleDriveFileIdFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("drive.google.com")) return undefined;

    const id = url.searchParams.get("id")?.trim();
    if (id) return id;

    const fileMatch = url.pathname.match(/\/file\/d\/([^/?#]+)/);
    return fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : undefined;
  } catch {
    return undefined;
  }
}

function displayUrl(value: string): string {
  const url = value.trim();
  const driveFileId = googleDriveFileIdFromUrl(url);
  return driveFileId ? driveDirectLink(driveFileId) : url;
}

export function urlFromImageValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const url = nonEmptyString(value);
    return url ? displayUrl(url) : undefined;
  }
  if (!isRecord(value)) return undefined;
  const primaryUrl =
    nonEmptyString(value.url) ??
    nonEmptyString(value.renderUrl) ??
    nonEmptyString(value.primaryUrl) ??
    nonEmptyString(value.chosen) ??
    nonEmptyString(value.best);
  const renderableUrl =
    nonEmptyString(value.directLink) ??
    nonEmptyString(value.webContentLink) ??
    nonEmptyString(value.thumbnailLink);
  const url =
    primaryUrl && googleDriveFileIdFromUrl(primaryUrl)
      ? renderableUrl ?? primaryUrl
      : primaryUrl ??
        renderableUrl ??
        nonEmptyString(value.webViewLink);

  return url ? displayUrl(url) : undefined;
}

function imagesFromQueryResults(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.queryResults)) return undefined;

  return value.queryResults.flatMap((group, groupIndex): unknown[] => {
    if (!isRecord(group) || !Array.isArray(group.candidates)) return [];
    const query = typeof group.query === "string" ? group.query : undefined;
    return group.candidates.map((candidate) => {
      if (!isRecord(candidate)) return candidate;
      return {
        ...candidate,
        locationQuery:
          typeof candidate.locationQuery === "string"
            ? candidate.locationQuery
            : query,
        locationQueryIndex:
          typeof candidate.locationQueryIndex === "number"
            ? candidate.locationQueryIndex
            : groupIndex,
      };
    });
  });
}

function imageArrayFrom(value: unknown): unknown[] {
  const queryResultImages = imagesFromQueryResults(value);
  if (queryResultImages) return queryResultImages;

  const raw =
    isRecord(value) && Array.isArray(value.images)
      ? value.images
      : isRecord(value) && Array.isArray(value.candidates)
        ? value.candidates
        : isRecord(value) && Array.isArray(value.ranked)
          ? value.ranked
          : isRecord(value) && Array.isArray(value.selected)
            ? value.selected
            : isRecord(value) && Array.isArray(value.selectedUrls)
              ? value.selectedUrls
              : isRecord(value) && Array.isArray(value.renderUrls)
                ? value.renderUrls
                : isRecord(value) && Array.isArray(value.designs)
                  ? value.designs
                  : value;

  return Array.isArray(raw) ? raw : [raw];
}

export function normalizeImageCandidates(value: unknown): ImageCandidate[] {
  const seen = new Set<string>();
  const candidates: ImageCandidate[] = [];

  for (const item of imageArrayFrom(value)) {
    const url = urlFromImageValue(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    if (isRecord(item)) {
      candidates.push({
        ...item,
        url,
        attribution:
          typeof item.attribution === "string" ? item.attribution : "",
      });
    } else {
      candidates.push({ url, attribution: "" });
    }
  }

  return candidates;
}
