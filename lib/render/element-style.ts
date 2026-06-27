import type { CSSProperties } from "react";
import {
  type Fill,
  type Gradient,
  type ImageElement,
  type PlaceholderData,
  type ShapeElement,
  type TemplateElement,
  type TextElement,
  isGradient,
} from "@/lib/editor/types";

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
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: el.autoWidth ? "center" : "flex-start",
    textAlign: el.textAlign ?? "left",
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight ?? 400,
    fontStyle: el.fontStyle ?? "normal",
    color: el.color,
    lineHeight: el.lineHeight ?? 1.2,
    letterSpacing: el.letterSpacing ?? 0,
    // A chip stays on one line so its width hugs the text; normal text wraps.
    whiteSpace: el.autoWidth ? "nowrap" : "pre-wrap",
    wordBreak: "break-word",
    overflow: "hidden",
  };
  if (el.background !== undefined) Object.assign(style, fillToStyle(el.background));
  if (el.paddingX || el.paddingY) {
    style.padding = `${el.paddingY ?? 0}px ${el.paddingX ?? 0}px`;
  }
  if (el.borderRadius) style.borderRadius = el.borderRadius;
  return style;
}

export function shapeStyle(el: ShapeElement): CSSProperties {
  const style: CSSProperties = {
    display: "flex",
    ...fillToStyle(el.fill),
    borderRadius: el.shape === "ellipse" ? "50%" : (el.borderRadius ?? 0),
  };
  if (el.borderWidth && el.borderColor) {
    style.border = `${el.borderWidth}px solid ${el.borderColor}`;
  }
  return style;
}

export function imageContainerStyle(el: ImageElement): CSSProperties {
  return {
    display: "flex",
    overflow: "hidden",
    borderRadius: el.borderRadius ?? 0,
  };
}

/** Resolve the text shown for a text element given (optional) placeholder data. */
export function resolveText(el: TextElement, data?: PlaceholderData): string {
  if (el.placeholderKey) {
    return data?.[el.placeholderKey] ?? `{${el.placeholderKey}}`;
  }
  return el.text;
}

/** Resolve the image src for an image element given (optional) placeholder data. */
export function resolveImageSrc(
  el: ImageElement,
  data?: PlaceholderData,
): string | undefined {
  if (el.placeholderKey) {
    return data?.[el.placeholderKey] ?? el.src;
  }
  return el.src;
}
