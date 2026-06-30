import type { Page, TemplateDoc, TemplateElement } from "@/lib/editor/types";
import {
  baseStyle,
  fillToStyle,
  imageContainerStyle,
  shapeStyle,
  textContentStyle,
  textStyle,
} from "@/lib/render/element-style";
import { FIT_MAX_FONT_SIZE, FIT_MIN_FONT_SIZE } from "@/lib/render/fit-text";
import {
  FIT_TEXT_COMPONENT_SOURCE,
  docHasAutoFit,
} from "./fit-runtime";
import { styleToObjectLiteral, toComponentName } from "./serialize";

/**
 * Generate a self-contained React component from a template document. Mirrors the
 * runtime <TemplateRenderer> so exported code matches preview/PNG output. The
 * component accepts a `data` prop that fills placeholders.
 */
function elementJsx(el: TemplateElement): string {
  if (el.type === "text") {
    const style = styleToObjectLiteral({ ...baseStyle(el), ...textStyle(el) });
    const contentStyle = styleToObjectLiteral(textContentStyle(el));
    const content = el.placeholderKey
      ? `{data[${JSON.stringify(el.placeholderKey)}] ?? ${JSON.stringify(el.text)}}`
      : `{${JSON.stringify(el.text)}}`;
    // Fit-to-box text re-sizes its font at runtime to fill the box for whatever
    // data fills it; everything else is a plain div with a fixed font size.
    if (el.autoFit) {
      const min = el.minFontSize ?? FIT_MIN_FONT_SIZE;
      const max = el.maxFontSize ?? FIT_MAX_FONT_SIZE;
      return `<FitText style={${style}} contentStyle={${contentStyle}} min={${min}} max={${max}}>${content}</FitText>`;
    }
    return `<div style={${style}}><div style={${contentStyle}}>${content}</div></div>`;
  }

  if (el.type === "image") {
    const containerStyle = styleToObjectLiteral({
      ...baseStyle(el),
      ...imageContainerStyle(el),
    });
    const imgStyle = styleToObjectLiteral({
      width: "100%",
      height: "100%",
      objectFit: el.objectFit ?? "cover",
      display: "block",
    });
    const srcExpr = el.placeholderKey
      ? `data[${JSON.stringify(el.placeholderKey)}] ?? ${JSON.stringify(el.src ?? "")}`
      : JSON.stringify(el.src ?? "");
    return `<div style={${containerStyle}}><img alt="" src={${srcExpr}} style={${imgStyle}} /></div>`;
  }

  const style = styleToObjectLiteral({ ...baseStyle(el), ...shapeStyle(el) });
  return `<div style={${style}} />`;
}

/** One page rendered as a self-contained canvas `<div>` (the design's size). */
function pageJsx(doc: TemplateDoc, page: Page, indent: string): string {
  const canvasStyle = styleToObjectLiteral({
    position: "relative",
    width: doc.width,
    height: doc.height,
    ...fillToStyle(page.background),
    overflow: "hidden",
    display: "flex",
  });
  const children = page.elements
    .map((el) => `${indent}  ${elementJsx(el)}`)
    .join("\n");
  return `<div style={${canvasStyle}}>\n${children}\n${indent}</div>`;
}

export function generateReactComponent(
  doc: TemplateDoc,
  name: string,
): string {
  const componentName = toComponentName(name);

  // A single-page design exports as one canvas div (unchanged). Multi-page designs
  // wrap their page canvases in a vertical stack so every page is emitted.
  const body =
    doc.pages.length === 1
      ? pageJsx(doc, doc.pages[0], "    ")
      : `<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
${doc.pages.map((p) => `      ${pageJsx(doc, p, "      ")}`).join("\n")}
    </div>`;

  // Fit-to-box text needs a runtime <FitText> (a client component, so the file
  // opts into "use client"); plain designs stay server-renderable as before.
  const hasAutoFit = docHasAutoFit(doc);
  const directive = hasAutoFit ? `"use client";\n\n` : "";
  const helper = hasAutoFit ? `\n${FIT_TEXT_COMPONENT_SOURCE}\n` : "";

  return `${directive}import React from "react";

export type TemplateData = Record<string, string>;
${helper}
export function ${componentName}({ data = {} }: { data?: TemplateData }) {
  return (
    ${body}
  );
}

export default ${componentName};
`;
}
