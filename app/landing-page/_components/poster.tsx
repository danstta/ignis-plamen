/**
 * Shared art for the fictional "Lisbon Poster" template that threads through
 * every mockup on the page: the hero pipeline renders it, the design editor
 * edits it, and the run view uploads it.
 */

export const LISBON_GRADIENT =
  "linear-gradient(168deg, #241a3a 0%, #6e2b3d 42%, #c25a2e 74%, #eea45c 100%)";

/** Per-page variants for multi-page (carousel) views of the same template. */
export const LISBON_PAGE_GRADIENTS = [
  LISBON_GRADIENT,
  "linear-gradient(168deg, #1c2440 0%, #4f2f4a 45%, #a5522f 78%, #e3b06b 100%)",
  "linear-gradient(168deg, #2e1f33 0%, #834032 50%, #d1772f 80%, #f2c078 100%)",
];

/** The fictional client brand stamped on the poster. */
export function PosterBrandRow() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full bg-white/90" />
      <span className="text-[9px] font-semibold tracking-[0.18em] text-white/90">
        ATLAS
      </span>
    </div>
  );
}
