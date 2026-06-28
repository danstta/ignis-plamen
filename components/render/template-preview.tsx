"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CanvasView, PlaceholderData } from "@/lib/editor/types";
import { TemplateRenderer } from "@/components/render/template-renderer";
import { cn } from "@/lib/utils";

/**
 * Renders a non-interactive, contained preview of a single canvas (one page).
 *
 * The shared <TemplateRenderer> always paints at the canvas's native pixel size;
 * this wrapper measures its own (parent-sized) box and applies a single CSS
 * `scale()` so the artboard fits inside without cropping — like
 * `object-fit: contain`. No rasterization or network round-trip: it's the same
 * DOM the editor draws. The parent is responsible for sizing the box.
 */
export function TemplatePreview({
  canvas,
  data,
  className,
}: {
  canvas: CanvasView;
  data?: PlaceholderData;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const fit = Math.min(
        el.clientWidth / canvas.width,
        el.clientHeight / canvas.height,
      );
      setScale(Number.isFinite(fit) ? fit : 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvas.width, canvas.height]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-muted", className)}
    >
      {scale > 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transformOrigin: "center",
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <TemplateRenderer canvas={canvas} data={data} />
        </div>
      )}
    </div>
  );
}
