import type { CSSProperties } from "react";
import type {
  CanvasView,
  PlaceholderData,
  TemplateElement,
} from "@/lib/editor/types";
import {
  baseStyle,
  fillToStyle,
  imageContainerStyle,
  resolveImageSrc,
  resolveText,
  shapeStyle,
  textStyle,
} from "@/lib/render/element-style";

/**
 * Renders a single template element. Shared by the editor canvas and the Satori
 * PNG path, so it must only use inline styles within the Satori-safe subset.
 *
 * `interactive` adds the `data-el-id` hook the editor uses for selection/Moveable.
 */
export function ElementView({
  el,
  data,
  interactive = false,
}: {
  el: TemplateElement;
  data?: PlaceholderData;
  interactive?: boolean;
}) {
  const hook = interactive
    ? { "data-el-id": el.id, className: "da-element" }
    : {};
  const style = baseStyle(el);

  if (el.type === "text") {
    return (
      <div style={{ ...style, ...textStyle(el) }} {...hook}>
        {resolveText(el, data)}
      </div>
    );
  }

  if (el.type === "image") {
    const src = resolveImageSrc(el, data);
    return (
      <div style={{ ...style, ...imageContainerStyle(el) }} {...hook}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: el.objectFit ?? "cover",
              display: "block",
            }}
          />
        ) : (
          <ImagePlaceholderBox label={el.placeholderKey} />
        )}
      </div>
    );
  }

  return <div style={{ ...style, ...shapeStyle(el) }} {...hook} />;
}

function ImagePlaceholderBox({ label }: { label?: string }) {
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
    color: "#6b7280",
    fontSize: 24,
    fontFamily: "sans-serif",
  };
  return <div style={style}>{label ? `{${label}}` : "image"}</div>;
}

/**
 * Renders a single canvas (one page) at its native pixel size. The caller scales
 * it (editor zoom) or rasterizes it (Satori). Elements paint in array order.
 */
export function TemplateRenderer({
  canvas,
  data,
  interactive = false,
}: {
  canvas: CanvasView;
  data?: PlaceholderData;
  interactive?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: canvas.width,
        height: canvas.height,
        ...fillToStyle(canvas.background),
        overflow: "hidden",
        display: "flex",
      }}
    >
      {canvas.elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          data={data}
          interactive={interactive}
        />
      ))}
    </div>
  );
}
