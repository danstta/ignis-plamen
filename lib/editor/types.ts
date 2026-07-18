/**
 * The template document model. This is the single source of truth that drives:
 *  - the editor canvas (M1)
 *  - the shared <TemplateRenderer> used for preview + Satori PNG (M2)
 *  - code export to React/HTML (M5)
 *
 * Elements are absolutely positioned DOM nodes (Satori-friendly: flexbox +
 * absolute positioning only). Keep new style props within the Satori-safe subset.
 */

import type { ShapeKind } from "./shapes";
import type { ListIconName } from "./icons";

export type ElementType = "text" | "image" | "shape" | "list";

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

/** Line style for an element border (maps to CSS `border-style`). */
export type BorderStyle = "solid" | "dashed" | "dotted";

/**
 * Border fields shared by shapes and images. A border is painted only when both
 * {@link borderWidth} and {@link borderColor} are set (see `borderToStyle`);
 * {@link borderStyle} defaults to "solid". Dashed/dotted may rasterize as solid
 * in the Satori PNG.
 */
export interface Bordered {
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: BorderStyle;
}

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
  textVerticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  letterSpacing?: number;
  /**
   * "Text chip" mode: the box hugs its text horizontally (left edge fixed, width
   * grows rightward). Width becomes intrinsic, so the layout engine sizes it to
   * the resolved text on every render path — including the Satori PNG with real
   * placeholder data. The `width` field is ignored while this is on.
   */
  autoWidth?: boolean;
  /**
   * "Fit to box" mode: the inverse of {@link autoWidth}. The box stays fixed
   * (width × height) and the FONT SIZE is computed so the wrapping text fills it
   * as large as possible, within [{@link minFontSize}, {@link maxFontSize}].
   *
   * The fit is recomputed from the *resolved* text on every render path (editor
   * preview, Satori PNG, code export) — so the PNG sizes to the real placeholder
   * value, not the sample typed in the editor. See {@link resolveFontSize} in
   * `lib/render/fit-text.ts`. While this is on, the stored `fontSize` is ignored
   * for rendering (kept so toggling the mode off restores the manual size).
   *
   * Mutually exclusive with {@link autoWidth} — auto-width needs an intrinsic
   * width, but fitting needs a fixed box to fit into. The editor enforces this.
   */
  autoFit?: boolean;
  /** Lower bound (px) for the auto-fit font size. Defaults to FIT_MIN_FONT_SIZE. */
  minFontSize?: number;
  /** Upper bound (px) for the auto-fit font size. Defaults to FIT_MAX_FONT_SIZE. */
  maxFontSize?: number;
  /** Background fill painted behind the text (the "pill"); solid or gradient. */
  background?: Fill;
  /** Horizontal padding around the text (px). */
  paddingX?: number;
  /** Vertical padding around the text (px). */
  paddingY?: number;
  /** Rounded corners for the background (px). */
  borderRadius?: number;
}

export interface ImageElement extends BaseElement, Bordered {
  type: "image";
  /** Literal image URL shown when no placeholder value is bound. */
  src?: string;
  /** When set, this element is an IMAGE placeholder filled by connection data. */
  placeholderKey?: string;
  objectFit?: "cover" | "contain" | "fill";
  /**
   * Frame shape. "ellipse" clips the image to an ellipse (a circle when the box
   * is square); "rect" (the default when unset) uses {@link borderRadius} for
   * its corners. Mirrors {@link ShapeElement}'s `shape`.
   */
  shape?: "rect" | "ellipse";
  /** Rounded corners (px) — only applies to the "rect" shape. */
  borderRadius?: number;
}

export interface ShapeElement extends BaseElement, Bordered {
  type: "shape";
  /**
   * Shape geometry. "rect"/"ellipse" use {@link borderRadius}; the polygon kinds
   * (triangle, diamond, …) are clipped — see {@link ShapeKind} and `shapes.ts`.
   */
  shape: ShapeKind;
  /** Solid color or gradient. */
  fill: Fill;
  /** Rounded corners (px) — only applies to the "rect" shape. */
  borderRadius?: number;
}

/** How a list's rows distribute across its (fixed) box height. */
export type ListDistribute = "top" | "middle" | "bottom" | "space-between";

/**
 * A vertical list that fits an ARRAY placeholder value into a fixed box — the
 * list counterpart of {@link TextElement.autoFit}. Each bound item renders as
 * one single-line row (optional bullet icon + text); the font size is computed
 * on every render path so all N rows fit the box, within
 * [{@link minFontSize}, {@link maxFontSize}]. See `resolveListFontSize` in
 * `lib/render/fit-text.ts`. The stored {@link fontSize} is only the working
 * value the resolvers overwrite (and the SSR fallback before measurement).
 *
 * Icon size and icon–text gap are fixed em ratios (see `lib/editor/icons.ts`),
 * and {@link itemGap} is in em too, so the whole row layout scales with the one
 * fitted font size — that single-scalar property is what lets the editor
 * preview, the Satori PNG, and exported code share one fit algorithm.
 */
export interface ListElement extends BaseElement {
  type: "list";
  /** When set, this element is a LIST placeholder filled by connection data. */
  placeholderKey?: string;
  /** Sample rows shown while designing; also the fallback when nothing is bound. */
  items: string[];
  fontFamily: string;
  /** Working/fitted font size (px); recomputed from resolved items per render. */
  fontSize: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  /** Lower bound (px) for the fitted font size. Defaults to FIT_MIN_FONT_SIZE. */
  minFontSize?: number;
  /** Upper bound (px) for the fitted font size. Defaults to LIST_MAX_FONT_SIZE. */
  maxFontSize?: number;
  /**
   * Minimum gap between rows, in em (× the fitted font size). The fit reserves
   * it; "space-between" then stretches the actual gaps to fill the box.
   */
  itemGap?: number;
  /** Row distribution across the box height. Defaults to "space-between". */
  distribute?: ListDistribute;
  /** Bullet icon drawn before each row; omit for plain text rows. */
  icon?: ListIconName;
  /** Icon fill color. Defaults to the text {@link color}. */
  iconColor?: string;
}

export type TemplateElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | ListElement;

/**
 * A partial update accepted by the editor store. Intersecting the partials keeps
 * every type-specific field available (e.g. `fontSize`, `fill`) while making the
 * discriminant `type` un-settable.
 */
export type ElementPatch = Partial<TextElement> &
  Partial<ImageElement> &
  Partial<ShapeElement> &
  Partial<ListElement>;

/**
 * A single page within a design. Holds its own background and elements; the page
 * dimensions are shared by the whole document (see {@link TemplateDoc}), matching
 * Canva — every page of a design is the same size.
 */
export interface Page {
  id: string;
  /** Page background: solid CSS color or gradient. */
  background: Fill;
  elements: TemplateElement[];
}

/**
 * One renderable canvas: a page projected to the paint-ready fields the renderer,
 * codegen, and font loader operate on. This is the unit a single PNG is produced
 * from. Build one with {@link pageView}.
 */
export interface CanvasView {
  width: number;
  height: number;
  background: Fill;
  elements: TemplateElement[];
}

/**
 * A multi-page design document (the current model). Pages share `width`/`height`;
 * each page carries its own background + elements. Legacy single-canvas documents
 * are `version: 1` (see {@link TemplateDocV1}) and upgraded by {@link migrateDoc}.
 */
export interface TemplateDoc {
  version: 2;
  /** Shared page size — every page renders at these dimensions. */
  width: number;
  height: number;
  /** Active brand identity (brands row id); drives color-picker swatches + fonts. */
  brandId?: string;
  /** Ordered pages; always at least one. */
  pages: Page[];
}

/**
 * The original single-canvas document. Still present in the database for designs
 * authored before multi-page support; never written anew. {@link migrateDoc}
 * wraps one of these into a one-page {@link TemplateDoc} on read.
 */
export interface TemplateDocV1 {
  version: 1;
  width: number;
  height: number;
  background: Fill;
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

/** Resolved image value for a placeholder, including optional crop controls. */
export interface PlaceholderImageValue {
  url: string;
  objectPosition?: string;
  scale?: number;
}

/** Resolved values that fill placeholders at render time. Lists are string[]. */
export type PlaceholderValue = string | PlaceholderImageValue | string[];
export type PlaceholderData = Record<string, PlaceholderValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isPlaceholderImageValue(
  value: unknown,
): value is PlaceholderImageValue {
  return isRecord(value) && typeof value.url === "string";
}

export function placeholderValueToText(
  value: PlaceholderValue | undefined,
): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join("\n");
  return isPlaceholderImageValue(value) ? value.url : value;
}

function itemToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isPlaceholderImageValue(value)) return value.url;
  return JSON.stringify(value);
}

/**
 * Normalize any bound value to LIST items (the single chokepoint every list
 * consumer parses through). Arrays keep one item per entry; strings split on
 * newlines — and a single line shaped like "a, b, c" splits on commas, the form
 * comma-joined upstream values (e.g. Notion multi-selects, `valueToText`)
 * arrive in. Blank entries are dropped, so an unbound/empty value yields [].
 */
export function toListItems(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map(itemToText).filter((item) => item !== "");
  }
  const lines = itemToText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0].includes(", ")) {
    return lines[0]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return lines;
}

/** A fresh empty page with the given background. */
export function createPage(background: Fill = "#ffffff"): Page {
  return { id: crypto.randomUUID(), background, elements: [] };
}

export function emptyDoc(width = 1080, height = 1080): TemplateDoc {
  return { version: 2, width, height, pages: [createPage()] };
}

/** Project a document page to the renderable canvas (page background + shared size). */
export function pageView(doc: TemplateDoc, page: Page): CanvasView {
  return {
    width: doc.width,
    height: doc.height,
    background: page.background,
    elements: page.elements,
  };
}

/**
 * Normalize any stored document to the current ({@link TemplateDoc}) shape. v2
 * docs pass through; a legacy v1 doc is wrapped into a single page. This is the
 * single migration chokepoint — call it at every read boundary so the rest of the
 * code only ever sees v2, and old single-page designs keep working untouched.
 */
export function migrateDoc(raw: TemplateDoc | TemplateDocV1): TemplateDoc {
  if (raw.version === 2) return raw;
  return {
    version: 2,
    width: raw.width,
    height: raw.height,
    ...(raw.brandId ? { brandId: raw.brandId } : {}),
    pages: [
      { id: crypto.randomUUID(), background: raw.background, elements: raw.elements },
    ],
  };
}

/** The kinds of placeholder a template can declare. */
export type PlaceholderKind = "text" | "image" | "list";

export interface PlaceholderDescriptor {
  key: string;
  kind: PlaceholderKind;
}

/** Collect the placeholder keys declared by a template, with their kind. */
export function collectPlaceholders(doc: TemplateDoc): PlaceholderDescriptor[] {
  const seen = new Map<string, PlaceholderKind>();
  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (
        (el.type === "text" || el.type === "image" || el.type === "list") &&
        el.placeholderKey
      ) {
        if (!seen.has(el.placeholderKey)) {
          seen.set(el.placeholderKey, el.type);
        }
      }
    }
  }
  return [...seen.entries()].map(([key, kind]) => ({ key, kind }));
}
