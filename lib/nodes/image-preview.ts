import { isHeicContentType } from "@/lib/images/content-types";

export type PreviewableImage = {
  url: string;
  previewUrl?: string;
  thumbnailLink?: string;
  mimeType?: string;
  name?: string;
};

function looksHeic(image: PreviewableImage) {
  return (
    isHeicContentType(image.mimeType) ||
    /\.(heic|heif|hif)(?:[?#].*)?$/i.test(image.name ?? image.url)
  );
}

export function imagePreviewSrc(image: PreviewableImage): string {
  if (looksHeic(image)) return image.previewUrl ?? image.url ?? image.thumbnailLink ?? "";
  return image.previewUrl ?? image.thumbnailLink ?? image.url;
}

/**
 * Rewrite a Google Drive/Photos thumbnail link to request a given pixel size.
 * These URLs carry the size in a trailing `=s<N>` segment; we only touch that
 * suffix so non-Google links pass through untouched.
 */
function sizedThumbnailLink(link: string, size: number): string {
  return /=s\d+(-[a-z]+)?$/i.test(link)
    ? link.replace(/=s\d+(-[a-z]+)?$/i, `=s${size}`)
    : link;
}

/**
 * Grid/thumbnail source: prefer Google's lightweight CDN `thumbnailLink` over
 * the full-resolution proxy (`previewUrl`), which downloads and re-encodes the
 * original on every request. The CDN thumbnail is a small pre-rendered JPEG —
 * fast, cacheable, and already valid for HEIC originals — so a wall of tiles no
 * longer triggers a wall of heavy proxy fetches. Falls back to the proxy (and
 * finally the raw url) when no thumbnail is available.
 *
 * `size`, when given, resizes the CDN thumbnail via its `=s<N>` suffix.
 */
export function imageThumbnailSrc(
  image: PreviewableImage,
  size?: number,
): string {
  if (image.thumbnailLink) {
    return size
      ? sizedThumbnailLink(image.thumbnailLink, size)
      : image.thumbnailLink;
  }
  return imagePreviewSrc(image);
}
