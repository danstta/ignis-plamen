import type { TextElement } from "@/lib/editor/types";

/**
 * Shared "fit text to box" algorithm. Given a fixed box and a way to measure one
 * line of text, it finds the largest font size at which the (wrapping) text fits
 * the box's width AND height — the engine behind {@link TextElement.autoFit}.
 *
 * This module is intentionally pure: no DOM, no Node, no font bytes. The caller
 * supplies a {@link LineMeasurer} sourced from its environment (canvas
 * `measureText` in the browser, opentype.js on the server). Driving every render
 * path through the SAME algorithm is what keeps the editor preview, the Satori
 * PNG, and the code export agreeing on the size.
 */

/** Default lower bound for an auto-fit font size (px). */
export const FIT_MIN_FONT_SIZE = 8;
/** Default upper bound for an auto-fit font size (px). */
export const FIT_MAX_FONT_SIZE = 400;

/**
 * Fraction of the box the fitted text is allowed to occupy. The small margin
 * absorbs the inevitable disagreements between our measurement and a given
 * layout engine's own line-breaking (Satori, the DOM), so the result errs
 * toward a hair of slack rather than clipping. Applied identically on every path
 * so they stay consistent.
 */
const FIT_SAFETY = 0.97;

/** Measure the rendered width (px) of a single line of text at a given font size. */
export type LineMeasurer = (text: string, fontSize: number) => number;

/**
 * Greedily wrap one paragraph (no `\n`) into lines no wider than `maxWidth`.
 * Words that are themselves too wide are broken between characters, mirroring the
 * `word-break: break-word` the renderer applies to text. Always returns ≥1 line.
 */
function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measureLine: (text: string) => number,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  const pushBrokenWord = (word: string) => {
    // The word alone exceeds maxWidth: emit char-chunks that each fit.
    let chunk = "";
    for (const ch of word) {
      if (chunk && measureLine(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureLine(candidate) <= maxWidth || !current) {
      // Fits on the current line — or the line is empty and we must place it
      // somewhere; if even alone it overflows, break it across lines.
      if (!current && measureLine(word) > maxWidth) {
        pushBrokenWord(word);
      } else {
        current = candidate;
      }
    } else {
      lines.push(current);
      if (measureLine(word) > maxWidth) {
        pushBrokenWord(word);
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Split on explicit newlines, then word-wrap each paragraph. */
function layout(
  text: string,
  maxWidth: number,
  measureLine: (text: string) => number,
): string[] {
  return text
    .split("\n")
    .flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measureLine));
}

export interface FitOptions {
  text: string;
  /** Inner box width available to the text (px, padding already subtracted). */
  maxWidth: number;
  /** Inner box height available to the text (px, padding already subtracted). */
  maxHeight: number;
  lineHeight: number;
  letterSpacing?: number;
  /** Smallest font size to consider (px). */
  min: number;
  /** Largest font size to consider (px). */
  max: number;
}

/**
 * Largest integer font size in `[min, max]` whose wrapped text fits the box.
 * Falls back to `min` when nothing fits (the text then overflows, but the box
 * clips it) so the result is always usable.
 */
export function fitFontSize(opts: FitOptions, measure: LineMeasurer): number {
  const letterSpacing = opts.letterSpacing ?? 0;
  const maxWidth = Math.max(1, opts.maxWidth);
  const maxHeight = Math.max(1, opts.maxHeight);
  const min = Math.max(1, Math.floor(opts.min));
  const max = Math.max(min, Math.floor(opts.max));

  const fits = (fontSize: number): boolean => {
    const measureLine = (text: string) =>
      measure(text, fontSize) +
      letterSpacing * Math.max(0, [...text].length - 1);
    const lines = layout(opts.text, maxWidth, measureLine);
    const widest = lines.reduce((w, line) => Math.max(w, measureLine(line)), 0);
    if (widest > maxWidth) return false;
    return lines.length * fontSize * opts.lineHeight <= maxHeight;
  };

  let lo = min;
  let hi = max;
  let best = min;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Resolve the concrete font size a text element should render at. For non-fit
 * elements this is just `el.fontSize`; for {@link TextElement.autoFit} ones it
 * runs {@link fitFontSize} against the resolved text and the element's fixed box.
 *
 * `text` is the already-resolved string (placeholder value or fallback), so the
 * size always reflects what will actually be drawn.
 */
export function resolveFontSize(
  el: TextElement,
  text: string,
  measure: LineMeasurer,
): number {
  if (!el.autoFit) return el.fontSize;
  const paddingX = el.paddingX ?? 0;
  const paddingY = el.paddingY ?? 0;
  return fitFontSize(
    {
      // Empty text would fit at any size; clamp to the upper bound instead.
      text: text || " ",
      maxWidth: (el.width - paddingX * 2) * FIT_SAFETY,
      maxHeight: (el.height - paddingY * 2) * FIT_SAFETY,
      lineHeight: el.lineHeight ?? 1.2,
      letterSpacing: el.letterSpacing ?? 0,
      min: el.minFontSize ?? FIT_MIN_FONT_SIZE,
      max: el.maxFontSize ?? FIT_MAX_FONT_SIZE,
    },
    measure,
  );
}
