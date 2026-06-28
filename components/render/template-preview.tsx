"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PlaceholderData, TemplateDoc } from "@/lib/editor/types";
import { TemplateRenderer } from "@/components/render/template-renderer";
import { cn } from "@/lib/utils";

/**
 * Renders a non-interactive, contained preview of a template document.
 *
 * The shared <TemplateRenderer> always paints at the document's native pixel
 * size; this wrapper measures its own (parent-sized) box and applies a single
 * CSS `scale()` so the artboard fits inside without cropping — like
 * `object-fit: contain`. No rasterization or network round-trip: it's the same
 * DOM the editor draws. The parent is responsible for sizing the box.
 */
export function TemplatePreview({
  doc,
  data,
  className,
}: {
  doc: TemplateDoc;
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
        el.clientWidth / doc.width,
        el.clientHeight / doc.height,
      );
      setScale(Number.isFinite(fit) ? fit : 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.width, doc.height]);

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
          <TemplateRenderer doc={doc} data={data} />
        </div>
      )}
    </div>
  );
}
