/**
 * Shared asset constants used by both the upload UI (client) and the API/service
 * (server), so the accept list and size cap can't drift between the two.
 */

/** Max upload size, in bytes (10 MB). */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/** MIME types accepted by the Assets library. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** `accept` attribute value for file inputs. */
export const ASSET_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

export const SVG_CONTENT_TYPE = "image/svg+xml";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** File extension for a MIME type, falling back to "bin". */
export function extensionForType(type: string): string {
  return EXTENSION_BY_TYPE[type] ?? "bin";
}

/** True for SVG assets (rendered/stored as code-or-file the same way). */
export function isSvgType(type: string | null | undefined): boolean {
  return type === SVG_CONTENT_TYPE;
}
