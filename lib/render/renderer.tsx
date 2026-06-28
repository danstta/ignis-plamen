import { ImageResponse } from "next/og";
import {
  pageView,
  type CanvasView,
  type PlaceholderData,
  type TemplateDoc,
} from "@/lib/editor/types";
import { TemplateRenderer } from "@/components/render/template-renderer";
import { loadFontsForCanvas } from "./fonts";

export type RenderInput = {
  /** One renderable canvas (a single page projected via {@link pageView}). */
  canvas: CanvasView;
  data?: PlaceholderData;
};

export interface Renderer {
  /** Render a single canvas to PNG bytes. */
  render(input: RenderInput): Promise<ArrayBuffer>;
}

/**
 * Default renderer: Satori via next/og's ImageResponse. Renders the same
 * <TemplateRenderer> used by the editor, so output matches preview.
 */
class SatoriRenderer implements Renderer {
  async render({ canvas, data }: RenderInput): Promise<ArrayBuffer> {
    const fonts = await loadFontsForCanvas(canvas, data);
    const image = new ImageResponse(
      <TemplateRenderer canvas={canvas} data={data} />,
      {
        width: canvas.width,
        height: canvas.height,
        fonts: fonts.map((f) => ({
          name: f.name,
          data: f.data,
          weight: f.weight,
          style: f.style,
        })),
      },
    );
    return image.arrayBuffer();
  }
}

/**
 * Placeholder for a full-fidelity Playwright renderer (full CSS, any font).
 * Wired in a later milestone; selectable via RENDERER=browser.
 */
class BrowserRenderer implements Renderer {
  async render(): Promise<ArrayBuffer> {
    throw new Error(
      "BrowserRenderer is not implemented yet. Use the default Satori renderer.",
    );
  }
}

let _renderer: Renderer | null = null;

export function getRenderer(): Renderer {
  if (_renderer) return _renderer;
  _renderer =
    process.env.RENDERER === "browser"
      ? new BrowserRenderer()
      : new SatoriRenderer();
  return _renderer;
}

/** Render a single page of a document (by index) to PNG bytes. */
export function renderDocPage(
  doc: TemplateDoc,
  pageIndex: number,
  data?: PlaceholderData,
): Promise<ArrayBuffer> {
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`Page ${pageIndex} does not exist`);
  return getRenderer().render({ canvas: pageView(doc, page), data });
}

/** Render every page of a document to PNG bytes, in page order. */
export function renderDocPages(
  doc: TemplateDoc,
  data?: PlaceholderData,
): Promise<ArrayBuffer[]> {
  return Promise.all(
    doc.pages.map((page) =>
      getRenderer().render({ canvas: pageView(doc, page), data }),
    ),
  );
}
