import type { CanvasView, PlaceholderData } from "@/lib/editor/types";
import { browserPreviewUrlForImageUrl } from "@/lib/nodes/image-input";
import { imageThumbnailSrc, type PreviewableImage } from "@/lib/nodes/image-preview";
import { resolveImageSrc } from "./element-style";

// Match picker tiles so a selection can reuse the image the browser already has.
export const PREVIEW_THUMBNAIL_SIZE = 400;

/** Browser-only source substitutions; original data and framing stay untouched. */
export function previewImageSources(
  canvas: CanvasView,
  data: PlaceholderData,
  images: PreviewableImage[],
): ReadonlyMap<string, string> {
  const candidates = new Map(images.map((image) => [image.url, image]));
  const sources = new Map<string, string>();
  for (const el of canvas.elements) {
    if (el.type !== "image") continue;
    const src = resolveImageSrc(el, data);
    if (!src || sources.has(src)) continue;
    const candidate = candidates.get(src);
    const previewSrc = candidate
      ? imageThumbnailSrc(candidate, PREVIEW_THUMBNAIL_SIZE)
      : src;
    sources.set(src, browserPreviewUrlForImageUrl(previewSrc) ?? previewSrc);
  }
  return sources;
}
