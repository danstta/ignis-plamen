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
