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
        const url = `https://cdn.jsdelivr.net/npm/${def.pkg}/files/${def.slug}-${subset}-${weight}-normal.woff`;
        jobs.push(fetchBytes(url).then((d) => toFont(d, weight)));
      }
    } else {
      jobs.push(readLocal(def.file(weight)).then((d) => toFont(d, weight)));
    }
  }

  return (await Promise.all(jobs)).filter((f): f is SatoriFont => f !== null);
}

/**
 * Load the raw bytes of a single representative face (one subset/file) for a
 * family + weight. Enough for server-side text measurement (opentype.js) — which
 * only needs glyph advances, not every subset. Unknown families fall back to
 * Inter, mirroring the renderer. Returns null only when even the fallback face
 * can't be read (e.g. offline with the local file missing).
 */
export async function loadFontBytes(
  family: string,
  rawWeight: number,
): Promise<ArrayBuffer | null> {
  const def = FONTS[family] ?? FONTS[FALLBACK_FAMILY];
  const weight = normalizeWeight(def, rawWeight);
  if (def.kind === "fontsource") {
    const url = `https://cdn.jsdelivr.net/npm/${def.pkg}/files/${def.slug}-${def.subsets[0]}-${weight}-normal.woff`;
    return fetchBytes(url);
  }
  return readLocal(def.file(weight));
}

/** Load the faces every text element on a canvas (one page) needs. */
export async function loadFontsForCanvas(
  canvas: CanvasView,
  _data?: PlaceholderData,
): Promise<SatoriFont[]> {
  // Group text elements by family, collecting the weights each one uses.
  // Unknown families (e.g. unwired brand fonts) map to Inter, preserving the
  // "previews custom, renders as Inter" behavior.
  const wanted = new Map<string, Set<FontWeight>>();
  const request = (family: string, rawWeight: number) => {
    const def = FONTS[family] ?? FONTS[FALLBACK_FAMILY];
    const set = wanted.get(def.family) ?? new Set<FontWeight>();
    set.add(normalizeWeight(def, rawWeight));
    wanted.set(def.family, set);
  };

  for (const el of canvas.elements) {
    if (el.type === "text") request(el.fontFamily, el.fontWeight ?? 400);
  }

  // Always keep Inter loaded as the ultimate layout/glyph fallback.
  if (!wanted.has(FALLBACK_FAMILY)) request(FALLBACK_FAMILY, 400);

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
