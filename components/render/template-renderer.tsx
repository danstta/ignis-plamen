import type { CSSProperties } from "react";
import type {
  CanvasView,
  PlaceholderData,
  TemplateElement,
} from "@/lib/editor/types";
import type { ListElement } from "@/lib/editor/types";
import { LIST_ICON_VIEWBOX, LIST_ICONS } from "@/lib/editor/icons";
import {
  baseStyle,
  fillToStyle,
  imageContainerStyle,
  imageContentStyle,
  imagePlacementContainerStyle,
  listContainerStyle,
  listIconSizePx,
  listRowStyle,
  resolveImage,
  resolveListItems,
  resolveText,
  shapeStyle,
  textContentStyle,
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
        <div style={textContentStyle(el)}>{resolveText(el, data)}</div>
      </div>
    );
  }

  if (el.type === "list") {
    const items = resolveListItems(el, data);
    // In the editor, an unbound key with no sample rows still needs a visible,
    // selectable hint; real renders with empty data draw nothing.
    const rows =
      items.length === 0 && interactive && el.placeholderKey
        ? [`{${el.placeholderKey}}`]
        : items;
    return (
      <div style={{ ...style, ...listContainerStyle(el) }} {...hook}>
        {rows.map((item, i) => (
          <div key={i} style={listRowStyle(el)}>
            {el.icon ? <ListRowIcon el={el} /> : null}
            <div style={{ whiteSpace: "nowrap" }}>{item}</div>
          </div>
        ))}
      </div>
    );
  }

  if (el.type === "image") {
    const image = resolveImage(el, data);
    return (
      <div
        style={{
          ...style,
          ...imageContainerStyle(el),
          ...imagePlacementContainerStyle(image),
        }}
        {...hook}
      >
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt=""
            width={Math.round(el.width * image.scale)}
            height={Math.round(el.height * image.scale)}
            style={imageContentStyle(el, image)}
          />
        ) : (
          <ImagePlaceholderBox label={el.placeholderKey} />
        )}
      </div>
    );
  }

  return <div style={{ ...style, ...shapeStyle(el) }} {...hook} />;
}

/** Bullet icon for one list row — inline SVG so Satori draws it identically. */
function ListRowIcon({ el }: { el: ListElement }) {
  if (!el.icon) return null;
  const size = listIconSizePx(el);
  return (
    <svg
      viewBox={LIST_ICON_VIEWBOX}
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    >
      <path d={LIST_ICONS[el.icon].path} fill={el.iconColor ?? el.color} />
    </svg>
  );
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
