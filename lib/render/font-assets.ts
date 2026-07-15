import type { FontDef, FontWeight } from "./font-registry";

export const FONT_SUBSET_RANGES: Record<string, string> = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  "latin-ext": "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF",
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  "cyrillic-ext": "U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
};

const FONT_SUBSET_LABELS: Record<string, string> = {
  latin: "Latin",
  "latin-ext": "Latin Extended",
  cyrillic: "Cyrillic",
  "cyrillic-ext": "Cyrillic Extended",
};

export function fontSourceSubsetFamily(
  def: Pick<Extract<FontDef, { kind: "fontsource" }>, "family">,
  subset: string,
): string {
  return `${def.family} ${FONT_SUBSET_LABELS[subset] ?? subset}`;
}

export function fontSourceFaceUrl(
  def: Extract<FontDef, { kind: "fontsource" }>,
  subset: string,
  weight: FontWeight,
): string {
  return `https://cdn.jsdelivr.net/npm/${def.pkg}/files/${def.slug}-${subset}-${weight}-normal.woff`;
}

export function editorFontRoute(
  family: string,
  weight: FontWeight,
  subset: string,
): string {
  return `/api/editor-fonts/${encodeURIComponent(family)}/${weight}/${encodeURIComponent(subset)}`;
}

export function fontFormat(file: string): string | null {
  const ext = file.split(".").pop()?.toLowerCase();
  if (ext === "woff") return "woff";
  if (ext === "ttf") return "truetype";
  if (ext === "otf") return "opentype";
  return null;
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function fontFaceCss({
  family,
  weight,
  src,
  format,
  range,
}: {
  family: string;
  weight: FontWeight;
  src: string;
  format?: string | null;
  range?: string;
}): string {
  return [
    "@font-face {",
    `  font-family: ${cssString(family)};`,
    "  font-style: normal;",
    `  font-weight: ${weight};`,
    "  font-display: swap;",
    `  src: url(${cssString(src)})${format ? ` format("${format}")` : ""};`,
    ...(range ? [`  unicode-range: ${range};`] : []),
    "}",
  ].join("\n");
}

export function buildEditorFontCss(fonts: Record<string, FontDef>): string {
  const chunks: string[] = [
    "/* Generated from lib/render/font-registry.ts. */",
  ];

  for (const def of Object.values(fonts)) {
    for (const weight of def.weights) {
      if (def.kind === "fontsource") {
        for (const subset of def.subsets) {
          const range = FONT_SUBSET_RANGES[subset];
          const route = editorFontRoute(def.family, weight, subset);
          chunks.push(
            fontFaceCss({
              family: def.family,
              weight,
              src: route,
              format: "woff",
              range,
            }),
            fontFaceCss({
              family: fontSourceSubsetFamily(def, subset),
              weight,
              src: route,
              format: "woff",
              range,
            }),
          );
        }
      } else {
        const file = def.file(weight);
        const format = fontFormat(file);
        chunks.push(
          fontFaceCss({
            family: def.family,
            weight,
            src: editorFontRoute(def.family, weight, "local"),
            format,
          }),
        );
      }
    }
  }

  return `${chunks.join("\n\n")}\n`;
}
