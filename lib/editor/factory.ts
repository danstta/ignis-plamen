import type {
  ImageElement,
  ShapeElement,
  TemplateDoc,
  TextElement,
} from "./types";

export const DEFAULT_FONT = "Inter";

function center(doc: TemplateDoc, w: number, h: number) {
  return {
    x: Math.round(doc.width / 2 - w / 2),
    y: Math.round(doc.height / 2 - h / 2),
  };
}

export function createText(
  doc: TemplateDoc,
  opts?: { placeholderKey?: string },
): TextElement {
  const width = Math.round(doc.width * 0.7);
  const height = 120;
  return {
    id: crypto.randomUUID(),
    type: "text",
    ...center(doc, width, height),
    width,
    height,
    text: opts?.placeholderKey ? "" : "Your text here",
    placeholderKey: opts?.placeholderKey,
    fontFamily: DEFAULT_FONT,
    fontSize: 64,
    fontWeight: 700,
    color: "#111111",
    textAlign: "left",
    lineHeight: 1.2,
  };
}

/**
 * A "text chip": text that hugs its content with a rounded background (a pill).
 * `autoWidth` makes the box size to the resolved text on every render path, so it
 * fits whatever value fills the placeholder. The stored `width` is unused while
 * auto-width is on but kept to satisfy the element model.
 */
export function createTextChip(
  doc: TemplateDoc,
  opts?: { placeholderKey?: string },
): TextElement {
  const width = 320;
  const height = 72;
  return {
    id: crypto.randomUUID(),
    type: "text",
    ...center(doc, width, height),
    width,
    height,
    text: opts?.placeholderKey ? "" : "Label",
    placeholderKey: opts?.placeholderKey,
    fontFamily: DEFAULT_FONT,
    fontSize: 36,
    fontWeight: 600,
    color: "#111111",
    textAlign: "center",
    lineHeight: 1.2,
    autoWidth: true,
    background: "#ffffff",
    paddingX: 28,
    paddingY: 14,
    borderRadius: 999,
  };
}

export function createImage(
  doc: TemplateDoc,
  opts?: { placeholderKey?: string; src?: string },
): ImageElement {
  const size = Math.round(Math.min(doc.width, doc.height) * 0.5);
  return {
    id: crypto.randomUUID(),
    type: "image",
    ...center(doc, size, size),
    width: size,
    height: size,
    src: opts?.src,
    placeholderKey: opts?.placeholderKey,
    objectFit: opts?.src ? "contain" : "cover",
    borderRadius: 0,
  };
}

export function createShape(
  doc: TemplateDoc,
  shape: "rect" | "ellipse" = "rect",
): ShapeElement {
  const width = 320;
  const height = 320;
  return {
    id: crypto.randomUUID(),
    type: "shape",
    ...center(doc, width, height),
    width,
    height,
    shape,
    fill: "#3b82f6",
    borderRadius: shape === "rect" ? 16 : 0,
  };
}
