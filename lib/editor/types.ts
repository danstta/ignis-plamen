/**
 * The template document model. This is the single source of truth that drives:
 *  - the editor canvas (M1)
 *  - the shared <TemplateRenderer> used for preview + Satori PNG (M2)
 *  - code export to React/HTML (M5)
 *
 * Elements are absolutely positioned DOM nodes (Satori-friendly: flexbox +
 * absolute positioning only). Keep new style props within the Satori-safe subset.
 */

export type ElementType = "text" | "image" | "shape";

/** A single color stop along a gradient. */
export interface GradientStop {
  /** CSS color. */
  color: string;
  /** Position along the gradient, 0–100 (%). */
  offset: number;
}

/** A linear or radial gradient. Kept in the Satori-safe subset (see fillToStyle). */
export interface Gradient {
  type: "linear" | "radial";
  /** Direction in degrees for linear gradients (CSS angle; 180 = top→bottom). */
  angle?: number;
  /** Two or more color stops. */
  stops: GradientStop[];
}

/** A paint value: either a solid CSS color string or a gradient. */
export type Fill = string | Gradient;

export function isGradient(fill: Fill): fill is Gradient {
  return typeof fill === "object" && fill !== null;
}

/** Build a gradient seeded from a fill (passes gradients through unchanged). */
export function toGradient(from: Fill): Gradient {
  if (isGradient(from)) return from;
  return {
    type: "linear",
    angle: 180,
    stops: [
      { color: from, offset: 0 },
      { color: "#ffffff", offset: 100 },
    ],
  };
}

/** Reduce a fill to a single representative solid color (its first stop). */
export function toSolid(fill: Fill): string {
  return isGradient(fill) ? (fill.stops[0]?.color ?? "#000000") : fill;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  /** Position/size in canvas pixels (top-left origin). */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  /** Paint order; higher renders on top. */
  z?: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  /** Literal text shown when no placeholder value is bound. */
  text: string;
  /** When set, this element is a TEXT placeholder filled by connection data. */
  placeholderKey?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  /**
   * "Text chip" mode: the box hugs its text horizontally (left edge fixed, width
   * grows rightward). Width becomes intrinsic, so the layout engine sizes it to
   * the resolved text on every render path — including the Satori PNG with real
   * placeholder data. The `width` field is ignored while this is on.
   */
  autoWidth?: boolean;
  /** Background fill painted behind the text (the "pill"); solid or gradient. */
  background?: Fill;
  /** Horizontal padding around the text (px). */
  paddingX?: number;
  /** Vertical padding around the text (px). */
  paddingY?: number;
  /** Rounded corners for the background (px). */
  borderRadius?: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  /** Literal image URL shown when no placeholder value is bound. */
  src?: string;
  /** When set, this element is an IMAGE placeholder filled by connection data. */
  placeholderKey?: string;
  objectFit?: "cover" | "contain" | "fill";
  borderRadius?: number;
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rect" | "ellipse";
  /** Solid color or gradient. */
  fill: Fill;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
}

export type TemplateElement = TextElement | ImageElement | ShapeElement;

/**
 * A partial update accepted by the editor store. Intersecting the partials keeps
 * every type-specific field available (e.g. `fontSize`, `fill`) while making the
 * discriminant `type` un-settable.
 */
export type ElementPatch = Partial<TextElement> &
  Partial<ImageElement> &
  Partial<ShapeElement>;

export interface TemplateDoc {
  version: 1;
  width: number;
  height: number;
  /** Canvas background: solid CSS color or gradient. */
  background: Fill;
  /** Active brand identity (brands row id); drives color-picker swatches + fonts. */
  brandId?: string;
  elements: TemplateElement[];
}

/** Canvas size presets for Instagram formats. */
export const CANVAS_PRESETS = {
  square: { width: 1080, height: 1080, label: "Square (1:1)" },
  portrait: { width: 1080, height: 1350, label: "Portrait (4:5)" },
  story: { width: 1080, height: 1920, label: "Story (9:16)" },
} as const;

export type CanvasPreset = keyof typeof CANVAS_PRESETS;

/** Resolved values that fill placeholders at render time: key -> text or image URL. */
export type PlaceholderData = Record<string, string>;

export function emptyDoc(width = 1080, height = 1080): TemplateDoc {
  return { version: 1, width, height, background: "#ffffff", elements: [] };
}

/** Collect the placeholder keys declared by a template, with their kind. */
export function collectPlaceholders(
  doc: TemplateDoc,
): { key: string; kind: "text" | "image" }[] {
  const seen = new Map<string, "text" | "image">();
  for (const el of doc.elements) {
    if ((el.type === "text" || el.type === "image") && el.placeholderKey) {
      if (!seen.has(el.placeholderKey)) {
        seen.set(el.placeholderKey, el.type);
      }
    }
  }
  return [...seen.entries()].map(([key, kind]) => ({ key, kind }));
}
