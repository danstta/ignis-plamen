const HEIC_CONTENT_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export function normalizeImageContentType(contentType: string | null | undefined) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isImageContentType(contentType: string | null | undefined) {
  return normalizeImageContentType(contentType).startsWith("image/");
}

export function isHeicContentType(contentType: string | null | undefined) {
  return HEIC_CONTENT_TYPES.has(normalizeImageContentType(contentType));
}
