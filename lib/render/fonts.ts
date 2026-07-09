import { promises as fs } from "node:fs";
import path from "node:path";
import type { CanvasView, PlaceholderData } from "@/lib/editor/types";
import {
  FALLBACK_FAMILY,
  FONTS,
  normalizeWeight,
  type FontDef,
  type FontWeight,
} from "./font-registry";
import { fontSourceFaceUrl } from "./font-assets";

/**
 * Satori needs fonts supplied as raw bytes (and only reads ttf/otf/woff — not
 * woff2). This module turns the font registry (./font-registry) into those bytes
 * for whatever a document uses, caching results in memory.
 *
 * Fontsource families are pulled as WOFF subsets from jsDelivr (one outbound
 * request per face on a cold cache). Local families are read from public/fonts/.
 * To go fully offline, convert the Fontsource entries to local ones and bundle
 * the .woff files.
 */

export type { FontWeight } from "./font-registry";

export type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal" | "italic";
};

const cache = new Map<string, ArrayBuffer | null>();

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(url, null);
      return null;
    }
    const data = await res.arrayBuffer();
    cache.set(url, data);
    return data;
  } catch {
    cache.set(url, null);
    return null;
  }
}

async function readLocal(file: string): Promise<ArrayBuffer | null> {
  const key = `local:${file}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "fonts", file));
    const data = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    cache.set(key, data);
    return data;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Load every face (one per weight, plus subsets for Fontsource) for a font. */
async function loadFaces(
  def: FontDef,
  weights: Set<FontWeight>,
): Promise<SatoriFont[]> {
  const jobs: Promise<SatoriFont | null>[] = [];
  const toFont = (data: ArrayBuffer | null, weight: FontWeight) =>
    data ? { name: def.family, data, weight, style: "normal" as const } : null;

  for (const weight of weights) {
    if (def.kind === "fontsource") {
      for (const subset of def.subsets) {
        jobs.push(
          fetchBytes(fontSourceFaceUrl(def, subset, weight)).then((d) =>
            toFont(d, weight),
          ),
        );
      }
    } else {
      jobs.push(readLocal(def.file(weight)).then((d) => toFont(d, weight)));
    }
  }

  return (await Promise.all(jobs)).filter((f): f is SatoriFont => f !== null);
}

/**
 * Load the raw bytes of every subset face for a family + weight — the input the
 * server-side auto-fit measurer (lib/render/measure-server.ts) parses with
 * opentype.js. Fontsource ships script subsets as separate files, while
 * opentype measures one face at a time, so the measurer must see every subset to
 * size mixed-script text (e.g. Latin + Cyrillic) correctly. Inter faces for the
 * same requested weight are appended as the ultimate glyph fallback, matching
 * the CSS stack used by the renderer. If every face fails to load, the caller
 * uses a rough estimate.
 */
export async function loadFontFaceBytes(
  family: string,
  rawWeight: number,
): Promise<ArrayBuffer[]> {
  const def = FONTS[family] ?? FONTS[FALLBACK_FAMILY];
  const load = async (font: FontDef, weight: FontWeight): Promise<ArrayBuffer[]> => {
    if (font.kind === "local") {
      const data = await readLocal(font.file(weight));
      return data ? [data] : [];
    }
    const datas = await Promise.all(
      font.subsets.map((subset) =>
        fetchBytes(fontSourceFaceUrl(font, subset, weight)),
      ),
    );
    return datas.filter((d): d is ArrayBuffer => d !== null);
  };

  const primary = await load(def, normalizeWeight(def, rawWeight));
  if (def.family === FALLBACK_FAMILY) return primary;

  const fallback = FONTS[FALLBACK_FAMILY];
  return [
    ...primary,
    ...(await load(fallback, normalizeWeight(fallback, rawWeight))),
  ];
}

/** Load the faces every text element on a canvas (one page) needs. */
export async function loadFontsForCanvas(
  canvas: CanvasView,
  _data?: PlaceholderData,
): Promise<SatoriFont[]> {
  void _data;
  // Group text elements by family, collecting the weights each one uses.
  // Unknown families (e.g. unwired brand fonts) map to Inter, preserving the
  // "previews custom, renders as Inter" behavior.
  const wanted = new Map<string, Set<FontWeight>>();
  const fallbackWeights = new Set<FontWeight>();
  const request = (family: string, rawWeight: number) => {
    const def = FONTS[family] ?? FONTS[FALLBACK_FAMILY];
    const set = wanted.get(def.family) ?? new Set<FontWeight>();
    set.add(normalizeWeight(def, rawWeight));
    wanted.set(def.family, set);
  };

  const fallback = FONTS[FALLBACK_FAMILY];
  for (const el of canvas.elements) {
    if (el.type === "text") {
      const rawWeight = el.fontWeight ?? 400;
      request(el.fontFamily, rawWeight);
      fallbackWeights.add(normalizeWeight(fallback, rawWeight));
    }
  }

  // Always keep Inter loaded as the ultimate layout/glyph fallback at the same
  // weights the canvas asks for. Loading only 400 makes missing Cyrillic glyphs
  // fall back to regular text even when the element requested 700.
  if (fallbackWeights.size === 0) fallbackWeights.add(400);
  for (const weight of fallbackWeights) request(FALLBACK_FAMILY, weight);

  const batches = await Promise.all(
    [...wanted].map(([family, weights]) => loadFaces(FONTS[family], weights)),
  );
  const fonts = batches.flat();

  // Guarantee at least one font so Satori can compute layout, even if every
  // lookup above failed (e.g. offline with only local fonts missing).
  if (fonts.length === 0) {
    fonts.push(
      ...(await loadFaces(FONTS[FALLBACK_FAMILY], new Set<FontWeight>([400]))),
    );
  }
  return fonts;
}
