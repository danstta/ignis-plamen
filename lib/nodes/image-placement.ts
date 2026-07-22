import type { PlaceholderValue } from "@/lib/editor/types";

/**
 * Pure image "framing" (crop/pan/zoom) vocabulary shared by the run-review
 * pickers, their live previews, and the workflow engine's locked output.
 *
 * The render engine crops an image with a keyword `objectPosition` (a 3x3 grid of
 * presets) plus a `scale` (1–3) carried on a {@link PlaceholderValue}. Those two
 * knobs are all the Satori PNG path can reproduce, so the editor preview and the
 * exported PNG stay in lockstep — see `imageContentStyle`/`resolveImage` in
 * `lib/render/element-style.ts`. Kept React-free so it can be unit-tested and
 * imported from anywhere; the matching UI lives in `image-framing.tsx`.
 */

export type ImagePlacement = { objectPosition: string; scale: number };

export const DEFAULT_PLACEMENT: ImagePlacement = {
  objectPosition: "center center",
  scale: 1,
};

/** True once the user has moved or zoomed the image away from the default frame. */
export function hasCustomPlacement(placement: ImagePlacement): boolean {
  return (
    placement.objectPosition !== DEFAULT_PLACEMENT.objectPosition ||
    placement.scale !== DEFAULT_PLACEMENT.scale
  );
}

/**
 * Collapse a URL + placement to the minimal placeholder value: a bare URL string
 * when the frame is untouched, else a `PlaceholderImageValue` carrying the crop.
 * Mirrors the engine's `imageChoiceToPlaceholderValue` so a picker's live preview
 * and the locked output resolve to the exact same pixels.
 */
export function placementToPlaceholderValue(
  url: string,
  placement: ImagePlacement,
): PlaceholderValue {
  if (!url) return "";
  if (!hasCustomPlacement(placement)) return url;
  return {
    url,
    objectPosition: placement.objectPosition,
    scale: placement.scale,
  };
}
