import type { ImageCandidate } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function urlFromImageValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const url =
    value.url ??
    value.renderUrl ??
    value.primaryUrl ??
    value.chosen ??
    value.best;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
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
