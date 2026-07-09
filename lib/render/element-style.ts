import type { CSSProperties } from "react";
import {
  type Bordered,
  type Fill,
  type Gradient,
  type ImageElement,
  type PlaceholderData,
  type ShapeElement,
  type TemplateElement,
  type TextElement,
  isGradient,
  isPlaceholderImageValue,
  placeholderValueToText,
} from "@/lib/editor/types";
import { shapeGeometryStyle } from "@/lib/editor/shapes";
import { FALLBACK_FAMILY } from "./font-registry";

/**
 * Pure element -> CSS helpers shared by the editor canvas and the Satori renderer.
 * Keep every style within the Satori-supported subset (flexbox + absolute
 * positioning; no grid).
 */

/** Serialize a gradient to a CSS image. Satori understands these via backgroundImage. */
export function gradientToCss(g: Gradient): string {
  const stops = g.stops.map((s) => `${s.color} ${s.offset}%`).join(", ");
  return g.type === "radial"
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${g.angle ?? 180}deg, ${stops})`;
}

/**
 * Resolve a Fill to the right CSS background property. Solid colors use
 * `backgroundColor`; gradients use `backgroundImage` — the property Satori reads
 * for `linear-gradient`/`radial-gradient`.
 */
export function fillToStyle(fill: Fill): CSSProperties {
  return isGradient(fill)
    ? { backgroundImage: gradientToCss(fill) }
    : { backgroundColor: fill };
}

/** A text element in "chip" mode hugs its text horizontally (intrinsic width). */
function isAutoWidth(el: TemplateElement): el is TextElement {
  return el.type === "text" && !!el.autoWidth;
}

function cssFontFamily(family: string): string {
  return JSON.stringify(family);
}

function fontFamilyStack(family: string): string {
  const fallback = cssFontFamily(FALLBACK_FAMILY);
  if (family === FALLBACK_FAMILY) return `${fallback}, sans-serif`;
  return `${cssFontFamily(family)}, ${fallback}, sans-serif`;
}

export function baseStyle(el: TemplateElement): CSSProperties {
  // Note: Satori rejects `transform: undefined`, so only set keys that have values.
  const style: CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    height: el.height,
    opacity: el.opacity ?? 1,
  };
  // Auto-width text omits `width` so the layout engine sizes it to its content
  // (left/top stay fixed → the box grows rightward).
  if (!isAutoWidth(el)) style.width = el.width;
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  return style;
}

export function textStyle(el: TextElement): CSSProperties {
  const verticalAlign = el.textVerticalAlign ?? (el.autoWidth ? "middle" : "top");
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent:
      verticalAlign === "middle"
        ? "center"
        : verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start",
    alignItems:
      el.textAlign === "center"
        ? "center"
        : el.textAlign === "right"
          ? "flex-end"
          : "flex-start",
    fontFamily: fontFamilyStack(el.fontFamily),
    fontSize: el.fontSize,
    fontWeight: el.fontWeight ?? 400,
    fontStyle: el.fontStyle ?? "normal",
    color: el.color,
    lineHeight: el.lineHeight ?? 1.2,
    letterSpacing: el.letterSpacing ?? 0,
    overflow: "hidden",
  };
  if (el.background !== undefined) Object.assign(style, fillToStyle(el.background));
  if (el.paddingX || el.paddingY) {
    style.padding = `${el.paddingY ?? 0}px ${el.paddingX ?? 0}px`;
  }
  if (el.borderRadius) style.borderRadius = el.borderRadius;
  return style;
}

/** Inner text flow. Keeping it separate makes flex alignment work in Satori too. */
export function textContentStyle(el: TextElement): CSSProperties {
  return {
    display: "flex",
    width: el.autoWidth ? "auto" : "100%",
    justifyContent:
      el.textAlign === "center"
        ? "center"
        : el.textAlign === "right"
          ? "flex-end"
          : "flex-start",
    textAlign: el.textAlign ?? "left",
    // A chip stays on one line so its width hugs the text; normal text wraps.
    whiteSpace: el.autoWidth ? "nowrap" : "pre-wrap",
    wordBreak: "break-word",
  };
}

/**
 * The CSS `border` for any {@link Bordered} element. Painted only when both a
 * width and color are present; `borderStyle` defaults to "solid". Shared by
 * shapes and images so their borders stay identical across every render path.
 */
export function borderToStyle(el: Bordered): CSSProperties {
  if (el.borderWidth && el.borderColor) {
    return {
      border: `${el.borderWidth}px ${el.borderStyle ?? "solid"} ${el.borderColor}`,
    };
  }
  return {};
}

export function shapeStyle(el: ShapeElement): CSSProperties {
  return {
    display: "flex",
    ...fillToStyle(el.fill),
    ...shapeGeometryStyle(el.shape, el.borderRadius),
    ...borderToStyle(el),
  };
}

/**
 * The corner radius that clips an image to its shape: a full circle/ellipse for
 * "ellipse", otherwise the rect corner radius. Lives in one place so the
 * container and the `<img>` itself always agree.
 */
export function imageBorderRadius(el: ImageElement): string | number {
  return el.shape === "ellipse" ? "50%" : (el.borderRadius ?? 0);
}

export function imageContainerStyle(el: ImageElement): CSSProperties {
  return {
    display: "flex",
    overflow: "hidden",
    borderRadius: imageBorderRadius(el),
    ...borderToStyle(el),
  };
}

/**
 * Clip applied directly to the `<img>`. Browsers clip the image to the
 * container's `border-radius` + `overflow: hidden`, but Satori (next/og) does
 * not clip `<img>` children that way — so the radius must also live on the
 * image element itself for the exported PNG to match the editor.
 */
export function imageClipStyle(el: ImageElement): CSSProperties {
  return { borderRadius: imageBorderRadius(el) };
}

export type ResolvedImage = {
  src?: string;
  objectPosition?: string;
  scale: number;
};

function normalizedScale(value: unknown): number {
  const scale = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(4, Math.max(1, scale));
}

function alignmentFromObjectPosition(position: string | undefined): {
  justifyContent: CSSProperties["justifyContent"];
  alignItems: CSSProperties["alignItems"];
} {
  const normalized = position?.toLowerCase() ?? "center center";
  const justifyContent = normalized.includes("left")
    ? "flex-start"
    : normalized.includes("right")
      ? "flex-end"
      : "center";
  const alignItems = normalized.includes("top")
    ? "flex-start"
    : normalized.includes("bottom")
      ? "flex-end"
      : "center";
  return { justifyContent, alignItems };
}

export function imageContentStyle(
  el: ImageElement,
  image: ResolvedImage,
): CSSProperties {
  const scale = image.scale || 1;
  return {
    width: el.width * scale,
    height: el.height * scale,
    objectFit: el.objectFit ?? "cover",
    objectPosition: image.objectPosition ?? "center center",
    display: "block",
    flexShrink: 0,
    ...imageClipStyle(el),
  };
}

export function imagePlacementContainerStyle(
  image: ResolvedImage,
): CSSProperties {
  return alignmentFromObjectPosition(image.objectPosition);
}

/** Resolve the text shown for a text element given (optional) placeholder data. */
export function resolveText(el: TextElement, data?: PlaceholderData): string {
  if (el.placeholderKey) {
    return placeholderValueToText(data?.[el.placeholderKey]) || `{${el.placeholderKey}}`;
  }
  return el.text;
}

/** Resolve the image and crop controls for an image element. */
export function resolveImage(
  el: ImageElement,
  data?: PlaceholderData,
): ResolvedImage {
  if (el.placeholderKey) {
    const value = data?.[el.placeholderKey];
    if (isPlaceholderImageValue(value)) {
      return {
        src: value.url || el.src,
        objectPosition: value.objectPosition,
        scale: normalizedScale(value.scale),
      };
    }
    return {
      src: placeholderValueToText(value) || el.src,
      scale: 1,
    };
  }
  return { src: el.src, scale: 1 };
}

/** Resolve the image src for an image element given (optional) placeholder data. */
export function resolveImageSrc(
  el: ImageElement,
  data?: PlaceholderData,
): string | undefined {
  return resolveImage(el, data).src;
}
