/**
 * The curated bullet-icon set for LIST elements. Icons are plain filled SVG
 * paths (24×24 viewBox) so every render path draws them identically: the editor
 * and exports emit a real `<svg>`, and Satori rasterizes the same inline SVG in
 * the PNG. No external assets — keep it that way so generation never depends on
 * the network for an icon.
 *
 * Client-safe: pure data, no DOM/Node imports.
 */

export interface ListIconDef {
  /** Human label shown in the icon picker. */
  label: string;
  /** Single filled path in a 24×24 viewBox; painted with the element's icon color. */
  path: string;
}

export const LIST_ICON_VIEWBOX = "0 0 24 24";

export const LIST_ICONS = {
  person: {
    label: "Person",
    path: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  },
  check: {
    label: "Check",
    path: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  },
  star: {
    label: "Star",
    path: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  },
  dot: {
    label: "Dot",
    path: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  },
  arrow: {
    label: "Arrow",
    path: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  },
  heart: {
    label: "Heart",
    path: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  },
} as const satisfies Record<string, ListIconDef>;

export type ListIconName = keyof typeof LIST_ICONS;

export const LIST_ICON_NAMES = Object.keys(LIST_ICONS) as ListIconName[];

export function isListIconName(value: unknown): value is ListIconName {
  return typeof value === "string" && value in LIST_ICONS;
}

/**
 * Icon geometry relative to the row's font size (em). Fixed ratios — not
 * user-tunable in v1 — so the fit algorithm, the renderer, and the exported
 * code all charge the same width for an icon without threading extra fields.
 */
export const LIST_ICON_SIZE_EM = 1;
/** Gap between the icon and its row text (em). */
export const LIST_ICON_GAP_EM = 0.5;
