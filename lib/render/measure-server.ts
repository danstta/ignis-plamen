import opentype from "opentype.js";
import type {
  CanvasView,
  PlaceholderData,
  TextElement,
} from "@/lib/editor/types";
import { resolveText } from "./element-style";
import { type LineMeasurer, resolveFontSize } from "./fit-text";
import { loadFontBytes } from "./fonts";

/**
 * Server-side text measurement for {@link TextElement.autoFit}, used by the
 * Satori PNG path. Satori can't measure text or scale a font to a box itself, so
 * we resolve each auto-fit element to a concrete font size here — measuring the
 * REAL placeholder value with opentype.js against the element's fixed box. The
 * browser mirror (canvas `measureText`) lives in `measure-client.ts`; both feed
 * the shared algorithm in `fit-text.ts`, so PNG and preview agree.
 */

// Parsed fonts are reused across renders (and across the deduped preload below).
const fontCache = new Map<string, opentype.Font | null>();

function cacheKey(family: string, weight: number): string {
  return `${family}@${weight}`;
}

async function loadFont(
  family: string,
  weight: number,
): Promise<opentype.Font | null> {
  const key = cacheKey(family, weight);
  const cached = fontCache.get(key);
  if (cached !== undefined) return cached;
  let font: opentype.Font | null = null;
  try {
    const bytes = await loadFontBytes(family, weight);
    if (bytes) font = opentype.parse(bytes);
  } catch {
    font = null;
  }
  fontCache.set(key, font);
  return font;
}

/** A {@link LineMeasurer} from a parsed font; rough estimate when unavailable. */
function measurerFor(font: opentype.Font | null): LineMeasurer {
  if (!font) return (text, fontSize) => text.length * fontSize * 0.5;
  return (text, fontSize) => font.getAdvanceWidth(text, fontSize);
}

/**
 * Resolve every auto-fit text element on a canvas to a concrete `fontSize` for
 * the given data. Canvases with no auto-fit text are returned untouched (no font
 * parsing), keeping the common path free of extra work.
 */
export async function resolveAutoFitCanvas(
  canvas: CanvasView,
  data?: PlaceholderData,
): Promise<CanvasView> {
  const fitting = canvas.elements.filter(
    (el): el is TextElement => el.type === "text" && !!el.autoFit,
  );
  if (fitting.length === 0) return canvas;

  // Preload the parsed face each fitting element needs (deduped by the cache).
  await Promise.all(
    fitting.map((el) => loadFont(el.fontFamily, el.fontWeight ?? 400)),
  );

  const elements = canvas.elements.map((el) => {
    if (el.type !== "text" || !el.autoFit) return el;
    const font = fontCache.get(cacheKey(el.fontFamily, el.fontWeight ?? 400)) ?? null;
    const fontSize = resolveFontSize(
      el,
      resolveText(el, data),
      measurerFor(font),
    );
    return fontSize === el.fontSize ? el : { ...el, fontSize };
  });
  return { ...canvas, elements };
}
