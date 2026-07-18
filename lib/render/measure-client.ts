import type { PlaceholderData, TemplateElement } from "@/lib/editor/types";
import { resolveListItems, resolveText } from "./element-style";
import {
  type LineMeasurer,
  resolveFontSize,
  resolveListFontSize,
} from "./fit-text";

/**
 * Browser-side text measurement for {@link TemplateElement.autoFit}. Uses the
 * Canvas 2D `measureText` API — which measures with the very font the browser is
 * already painting in the editor — so the live preview's fitted size matches what
 * the user sees. The server mirror (opentype.js) lives in `measure-server.ts`;
 * both feed the shared algorithm in `fit-text.ts`.
 */

let ctx: CanvasRenderingContext2D | null | undefined;

/** Lazily create (and cache) a measuring canvas context; null outside the DOM. */
function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  ctx =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  return ctx;
}

/** Quote a family containing spaces so it forms a valid CSS `font` shorthand. */
function cssFamily(family: string): string {
  return /\s/.test(family) ? `"${family}"` : family;
}

/** A {@link LineMeasurer} for one element's font, backed by canvas `measureText`. */
export function canvasLineMeasurer(font: {
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
}): LineMeasurer {
  const c = getCtx();
  const style = font.fontStyle ?? "normal";
  const weight = font.fontWeight ?? 400;
  const family = `${cssFamily(font.fontFamily)}, sans-serif`;
  return (text, fontSize) => {
    if (!c) return text.length * fontSize * 0.5; // headless fallback
    c.font = `${style} ${weight} ${fontSize}px ${family}`;
    return c.measureText(text).width;
  };
}

/**
 * Replace each auto-fit text element — and each list element, whose fit is
 * intrinsic — with a copy whose `fontSize` is the size that fills its box for
 * the resolved content. Other elements pass through by reference, so a canvas
 * with no fitting elements returns an equal-by-identity array for cheap
 * memoization. `measureText` is synchronous, so this is render-safe.
 */
export function resolveAutoFitElements(
  elements: TemplateElement[],
  data?: PlaceholderData,
): TemplateElement[] {
  return elements.map((el) => {
    if (el.type === "list") {
      const fontSize = resolveListFontSize(
        el,
        resolveListItems(el, data),
        canvasLineMeasurer(el),
      );
      return fontSize === el.fontSize ? el : { ...el, fontSize };
    }
    if (el.type !== "text" || !el.autoFit) return el;
    const fontSize = resolveFontSize(
      el,
      resolveText(el, data),
      canvasLineMeasurer(el),
    );
    return fontSize === el.fontSize ? el : { ...el, fontSize };
  });
}
