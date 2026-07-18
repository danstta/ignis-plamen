// opentype.js v2 is ESM with named exports only (no default) — importing the
// default breaks the Turbopack/Vercel build, which resolves the .mjs entry.
import { type Font, parse } from "opentype.js";
import type {
  CanvasView,
  ListElement,
  PlaceholderData,
  TextElement,
} from "@/lib/editor/types";
import { resolveListItems, resolveText } from "./element-style";
import {
  type LineMeasurer,
  resolveFontSize,
  resolveListFontSize,
} from "./fit-text";
import { loadFontFaceBytes } from "./fonts";

/**
 * Server-side text measurement for {@link TextElement.autoFit}, used by the
 * Satori PNG path. Satori can't measure text or scale a font to a box itself, so
 * we resolve each auto-fit element to a concrete font size here — measuring the
 * REAL placeholder value with opentype.js against the element's fixed box. The
 * browser mirror (canvas `measureText`) lives in `measure-client.ts`; both feed
 * the shared algorithm in `fit-text.ts`, so PNG and preview agree.
 */

// Parsed faces are reused across renders (and across the deduped preload below).
// Each family@weight maps to every subset face that loaded (Latin, Cyrillic, …);
// the measurer composes glyph advances across them, mirroring how Satori draws.
const faceCache = new Map<string, Font[]>();

/**
 * Width (in em) charged for a code point no loaded face can draw. opentype's own
 * `.notdef` advance is ~1em, which made Cyrillic text measured against a
 * Latin-only face come out ~1.8× too wide and auto-fit to a tiny size. A half-em
 * is a sane neutral guess and matches the no-font rough estimate below.
 */
const MISSING_GLYPH_EM = 0.5;

function cacheKey(family: string, weight: number): string {
  return `${family}@${weight}`;
}

async function loadFaces(family: string, weight: number): Promise<Font[]> {
  const key = cacheKey(family, weight);
  const cached = faceCache.get(key);
  if (cached !== undefined) return cached;
  let faces: Font[] = [];
  try {
    const buffers = await loadFontFaceBytes(family, weight);
    // Parse each face independently so one bad subset can't sink the rest.
    faces = buffers.flatMap((bytes) => {
      try {
        return [parse(bytes)];
      } catch {
        return [];
      }
    });
  } catch {
    faces = [];
  }
  faceCache.set(key, faces);
  return faces;
}

/**
 * A {@link LineMeasurer} backed by a family's subset faces. Each code point's
 * advance is resolved against the FIRST face that actually has the glyph —
 * mirroring Satori's cross-subset glyph fallback — so mixed-script text (Latin +
 * Cyrillic) measures at its true width. Glyphs absent from every face fall back
 * to {@link MISSING_GLYPH_EM} rather than opentype's wide `.notdef`. With no
 * parsed face at all, a rough per-character estimate is used.
 *
 * Kerning is intentionally ignored: it can't be composed across faces and its
 * effect is below the slack `fit-text.ts` already leaves, while the missing-glyph
 * error it replaces was ~80%.
 */
function measurerFor(faces: Font[]): LineMeasurer {
  if (faces.length === 0) {
    return (text, fontSize) => text.length * fontSize * 0.5;
  }

  // Advance per code point in em (font-size-independent), memoized across calls
  // since the fitter re-measures the same text at many candidate sizes.
  const advanceEm = new Map<string, number>();
  const emFor = (ch: string): number => {
    const hit = advanceEm.get(ch);
    if (hit !== undefined) return hit;
    let em = MISSING_GLYPH_EM;
    for (const face of faces) {
      if (face.hasChar(ch)) {
        em = (face.charToGlyph(ch).advanceWidth ?? 0) / face.unitsPerEm;
        break;
      }
    }
    advanceEm.set(ch, em);
    return em;
  };

  return (text, fontSize) => {
    let em = 0;
    for (const ch of text) em += emFor(ch);
    return em * fontSize;
  };
}

/**
 * Resolve every fitting element on a canvas — auto-fit text, plus lists (whose
 * fit is intrinsic) — to a concrete `fontSize` for the given data. Canvases
 * with no fitting elements are returned untouched (no font parsing), keeping
 * the common path free of extra work.
 */
export async function resolveAutoFitCanvas(
  canvas: CanvasView,
  data?: PlaceholderData,
): Promise<CanvasView> {
  const fitting = canvas.elements.filter(
    (el): el is TextElement | ListElement =>
      (el.type === "text" && !!el.autoFit) || el.type === "list",
  );
  if (fitting.length === 0) return canvas;

  // Preload the parsed faces each fitting element needs (deduped by the cache).
  await Promise.all(
    fitting.map((el) => loadFaces(el.fontFamily, el.fontWeight ?? 400)),
  );

  const elements = canvas.elements.map((el) => {
    if (el.type !== "list" && (el.type !== "text" || !el.autoFit)) return el;
    const faces = faceCache.get(cacheKey(el.fontFamily, el.fontWeight ?? 400)) ?? [];
    const fontSize =
      el.type === "list"
        ? resolveListFontSize(el, resolveListItems(el, data), measurerFor(faces))
        : resolveFontSize(el, resolveText(el, data), measurerFor(faces));
    return fontSize === el.fontSize ? el : { ...el, fontSize };
  });
  return { ...canvas, elements };
}
