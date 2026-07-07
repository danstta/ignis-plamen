import type {
  Page,
  PlaceholderData,
  TemplateDoc,
  TemplateElement,
} from "@/lib/editor/types";
import {
  baseStyle,
  fillToStyle,
  imageContainerStyle,
  imageContentStyle,
  imagePlacementContainerStyle,
  resolveImage,
  resolveText,
  shapeStyle,
  textContentStyle,
  textStyle,
} from "@/lib/render/element-style";
import { FIT_MAX_FONT_SIZE, FIT_MIN_FONT_SIZE } from "@/lib/render/fit-text";
import { FIT_HTML_SCRIPT, docHasAutoFit } from "./fit-runtime";
import { escapeHtml, styleToInlineCss } from "./serialize";

/**
 * Generate a standalone HTML document from a template. Placeholders are filled
 * from `data`; unresolved ones render as `{key}` (same convention as the editor).
 */
function elementHtml(el: TemplateElement, data?: PlaceholderData): string {
  if (el.type === "text") {
    const style = styleToInlineCss({ ...baseStyle(el), ...textStyle(el) });
    const contentStyle = styleToInlineCss(textContentStyle(el));
    const content = escapeHtml(resolveText(el, data));
    // Fit-to-box text is tagged for the runtime fitter (see FIT_HTML_SCRIPT),
    // which sizes the font to the box after layout.
    if (el.autoFit) {
      const min = el.minFontSize ?? FIT_MIN_FONT_SIZE;
      const max = el.maxFontSize ?? FIT_MAX_FONT_SIZE;
      return `<div style="${style}" data-fit data-fit-min="${min}" data-fit-max="${max}"><div style="${contentStyle}">${content}</div></div>`;
    }
    return `<div style="${style}"><div style="${contentStyle}">${content}</div></div>`;
  }

  if (el.type === "image") {
    const image = resolveImage(el, data);
    const containerStyle = styleToInlineCss({
      ...baseStyle(el),
      ...imageContainerStyle(el),
      ...imagePlacementContainerStyle(image),
    });
    const imgStyle = styleToInlineCss(imageContentStyle(el, image));
    const src = image.src ?? "";
    return `<div style="${containerStyle}"><img alt="" src="${escapeHtml(src)}" style="${imgStyle}" /></div>`;
  }

  const style = styleToInlineCss({ ...baseStyle(el), ...shapeStyle(el) });
  return `<div style="${style}"></div>`;
}

/** One page rendered as a self-contained canvas `<div>` (the design's size). */
function pageHtml(doc: TemplateDoc, page: Page, data?: PlaceholderData): string {
  const canvasStyle = styleToInlineCss({
    position: "relative",
    width: doc.width,
    height: doc.height,
    ...fillToStyle(page.background),
    overflow: "hidden",
  });
  const body = page.elements
    .map((el) => `        ${elementHtml(el, data)}`)
    .join("\n");
  return `    <div style="${canvasStyle}">\n${body}\n    </div>`;
}

export function generateHtml(doc: TemplateDoc, data?: PlaceholderData): string {
  // Each page is a sibling canvas; multiple pages stack vertically with a gap.
  const pages = doc.pages.map((p) => pageHtml(doc, p, data)).join("\n");
  const script = docHasAutoFit(doc) ? `\n${FIT_HTML_SCRIPT}` : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { margin: 0; box-sizing: border-box; }
      body { display: flex; flex-direction: column; gap: 24px; align-items: flex-start; }
    </style>
  </head>
  <body>
${pages}${script}
  </body>
</html>
`;
}
