import type { CSSProperties } from "react";

/**
 * The geometry of a {@link ShapeElement}. "rect" and "ellipse" are drawn with
 * `border-radius`; every other kind is a polygon drawn with `clip-path` (see
 * {@link CLIP_PATHS}). The clip-path subset is rendered identically by the editor
 * canvas, the Satori PNG (next/og), and the React/HTML code export — they all
 * consume {@link shapeGeometryStyle}, so there is a single source of truth.
 */
export type ShapeKind =
  | "rect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "star"
  | "arrow";

/**
 * `clip-path: polygon(...)` recipe per polygon shape. Coordinates are percentages
 * of the element box, so the shape scales with width/height. Satori supports
 * `clip-path` with `polygon()`, so these render in the PNG too.
 */
const CLIP_PATHS: Partial<Record<ShapeKind, string>> = {
  triangle: "polygon(50% 0%, 0% 100%, 100% 100%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
  star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  arrow: "polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)",
};

/** The clip-path for a polygon shape, or `undefined` for rect/ellipse. */
export function shapeClipPath(shape: ShapeKind): string | undefined {
  return CLIP_PATHS[shape];
}

/**
 * A polygon shape is clipped with `clip-path`. A CSS `border` would be sliced by
 * that clip (so it can't paint a clean stroke), and `border-radius` is a no-op —
 * the editor hides those controls for polygon shapes accordingly.
 */
export function isPolygonShape(shape: ShapeKind): boolean {
  return CLIP_PATHS[shape] !== undefined;
}

/**
 * The geometry half of a shape's style: the rounded-corner radius for "rect", a
 * full ellipse for "ellipse", or the `clip-path` polygon for every other kind.
 * Kept separate from fill/border so all render paths share these exact values.
 */
export function shapeGeometryStyle(
  shape: ShapeKind,
  borderRadius?: number,
): CSSProperties {
  if (shape === "ellipse") return { borderRadius: "50%" };
  const clip = CLIP_PATHS[shape];
  if (clip) return { clipPath: clip };
  return { borderRadius: borderRadius ?? 0 };
}
