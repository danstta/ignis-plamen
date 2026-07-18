/**
 * Single source of truth for the fonts the renderer can embed.
 *
 * The editor's font picker (components/editor/properties-panel.tsx) lists these
 * families, and the Satori loader (lib/render/fonts.ts) turns each into raw font
 * bytes. Keeping both sides driven by this one registry is what guarantees the
 * dropdown can't list a font the renderer can't actually produce.
 *
 * Any family NOT listed here still previews in the browser (the OS draws it) but
 * renders as Inter in the exported PNG — Satori only has bytes for what's here.
 *
 * This module is intentionally free of Node-only imports (no fs) so it is safe
 * to import from client components. The file reading lives in fonts.ts.
 */

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type FontDef =
  | {
      family: string;
      /** Fetched as WOFF subsets from jsDelivr (Fontsource). */
      kind: "fontsource";
      /** jsDelivr package spec, e.g. "@fontsource/roboto@5.0.8". */
      pkg: string;
      /** Fontsource file-name slug, e.g. "roboto". */
      slug: string;
      subsets: readonly string[];
      /** Weights the package actually ships (others are snapped to the nearest). */
      weights: readonly FontWeight[];
    }
  | {
      family: string;
      /** Read from `public/fonts/` on disk — for licensed faces not on a CDN. */
      kind: "local";
      /**
       * Map a weight to a file under `public/fonts/`. Files must be ttf/otf/woff
       * (NOT woff2 — Satori can't read it). A missing file simply falls back to
       * Inter at render time, so listing a font before its file exists is safe.
       */
      file: (weight: FontWeight) => string;
      weights: readonly FontWeight[];
    };

// Subsets fetched for every Fontsource family. Latin + Latin-Extended cover
// Western/Balkan diacritics (č/ć/š/ž/đ); Cyrillic covers modern Serbian
// Cyrillic (ђ/љ/њ/ћ/џ), and Cyrillic-Extended widens coverage for other
// Cyrillic scripts. Satori composes glyphs across all loaded subset faces, and
// the server-side auto-fit measurer (lib/render/measure-server.ts) mirrors that,
// so a document mixing scripts both renders and fits correctly.
const SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"] as const;

/** The font every render keeps loaded as the ultimate layout/glyph fallback. */
export const FALLBACK_FAMILY = "Inter";

export const FONTS: Record<string, FontDef> = {
  Inter: {
    family: "Inter",
    kind: "fontsource",
    pkg: "@fontsource/inter@4.5.15",
    slug: "inter",
    subsets: SUBSETS,
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  Roboto: {
    family: "Roboto",
    kind: "fontsource",
    pkg: "@fontsource/roboto@5.0.8",
    slug: "roboto",
    subsets: SUBSETS,
    // Roboto on Fontsource ships these weights only (no 200/600/800).
    weights: [100, 300, 400, 500, 700, 900],
  },
  Montserrat: {
    family: "Montserrat",
    kind: "fontsource",
    pkg: "@fontsource/montserrat@5.0.18",
    slug: "montserrat",
    subsets: SUBSETS,
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  "Open Sans": {
    family: "Open Sans",
    kind: "fontsource",
    pkg: "@fontsource/open-sans@5.2.7",
    slug: "open-sans",
    subsets: SUBSETS,
    weights: [300, 400, 500, 600, 700, 800],
  },
  // Thin hand-printed face with full Cyrillic — the closest free match to
  // Canva's "Adult Notepad", which is Canva-exclusive and has no obtainable
  // font file. Fontsource ships only latin + cyrillic at weight 400: Serbian
  // Cyrillic (ђ/љ/њ/ћ/џ) renders natively, Latin diacritics (č/ć/š/ž/đ) fall
  // back to Inter, and bold snaps to 400 in exports.
  Neucha: {
    family: "Neucha",
    kind: "fontsource",
    pkg: "@fontsource/neucha@5.2.8",
    slug: "neucha",
    subsets: ["latin", "cyrillic"],
    weights: [400],
  },
  // Licensed faces — supply the files in public/fonts/ (see the README there).
  // Adjust the weights to match the files you actually drop in.
  Garet: {
    family: "Garet",
    kind: "local",
    file: (w) => `garet-${w}.otf`,
    weights: [400, 700],
  },
};

/** Families to offer in the editor's font picker, in registry order. */
export const FONT_FAMILIES = Object.keys(FONTS);

/** Pick the nearest weight a given font actually ships. */
export function normalizeWeight(def: FontDef, w: number): FontWeight {
  return def.weights.reduce((best, cur) =>
    Math.abs(cur - w) < Math.abs(best - w) ? cur : best,
  );
}
