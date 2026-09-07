import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TemplateRenderer } from "@/components/render/template-renderer";
import type { CanvasView, ImageElement, PlaceholderData } from "@/lib/editor/types";
import { previewImageSources } from "./preview-images";

const image: ImageElement = {
  id: "photo", type: "image", x: 0, y: 0, width: 1080, height: 1350,
  placeholderKey: "photo", src: "https://example.com/sample.jpg",
};
const canvas: CanvasView = {
  width: 1080, height: 1350, background: "#fff",
  elements: [image, {
    id: "caption", type: "text", x: 0, y: 0, width: 200, height: 100,
    text: "", placeholderKey: "caption", fontSize: 20, fontFamily: "Arial", color: "#000",
  }],
};

describe("live preview image sources", () => {
  test("reuses thumbnail URLs without changing export data or crop", () => {
    const data: PlaceholderData = {
      photo: { url: "https://example.com/original.heic", objectPosition: "right top", scale: 2 },
      caption: "https://example.com/original.heic",
    };
    const sources = previewImageSources(canvas, data, [{
      url: "https://example.com/original.heic",
      thumbnailLink: "https://example.com/thumb=s200",
      previewUrl: "/api/drive-images/123",
    }]);
    const preview = renderToStaticMarkup(createElement(TemplateRenderer, { canvas, data, imageSources: sources }));
    const exported = renderToStaticMarkup(createElement(TemplateRenderer, { canvas, data }));
    expect(preview).toContain('src="https://example.com/thumb=s400"');
    expect(preview).toContain("object-position:right top");
    expect(preview).toContain("width:2160px");
    expect(preview).toContain(">https://example.com/original.heic</div>");
    expect(exported).toContain('src="https://example.com/original.heic"');
    expect(data.photo).toEqual({ url: "https://example.com/original.heic", objectPosition: "right top", scale: 2 });
  });

  test("resolves bound and static Google Drive links through the browser proxy", () => {
    const drive = "https://drive.google.com/file/d/test-file/view";
    expect(previewImageSources(canvas, { photo: drive }, []).get(drive))
      .toBe("/api/drive-link-images/test-file");
    expect(previewImageSources(canvas, { photo: drive }, [{ url: drive }]).get(drive))
      .toBe("/api/drive-link-images/test-file");
    const staticCanvas: CanvasView = { ...canvas, elements: [{
      ...image, placeholderKey: undefined, src: drive,
    }] };
    expect(previewImageSources(staticCanvas, {}, []).get(drive))
      .toBe("/api/drive-link-images/test-file");
  });

  test("uses browser-compatible previews for HEIC without a thumbnail", () => {
    const url = "https://example.com/original.heic";
    expect(previewImageSources(canvas, { photo: url }, [{ url, previewUrl: "/api/drive-images/123" }]).get(url))
      .toBe("/api/drive-images/123");
  });

  test("keeps sample images when a slot is empty and only resolves the visible page", () => {
    const sources = previewImageSources(canvas, {}, [{ url: "https://example.com/unused.jpg" }]);
    expect([...sources.keys()]).toEqual(["https://example.com/sample.jpg"]);
  });
});
