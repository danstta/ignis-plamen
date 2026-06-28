"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteViewer from "react-infinite-viewer";
import Moveable, {
  type OnDrag,
  type OnDragGroup,
  type OnResize,
  type OnResizeGroup,
  type OnRotate,
  type OnRotateGroup,
} from "react-moveable";
import Selecto from "react-selecto";
import { Minus, Plus, Maximize } from "lucide-react";
import { currentPage, useEditor, type GeometryPatch } from "@/lib/editor/store";
import { ElementView } from "@/components/render/template-renderer";
import { fillToStyle } from "@/lib/render/element-style";
import { Button } from "@/components/ui/button";

/** Read an element's committed geometry back out of its (imperatively-updated) DOM. */
function readGeometry(node: Element): GeometryPatch | null {
  const id = node.getAttribute("data-el-id");
  if (!id) return null;
  const s = (node as HTMLElement).style;
  const m = /rotate\(([-0-9.]+)deg\)/.exec(s.transform);
  return {
    id,
    x: parseFloat(s.left) || 0,
    y: parseFloat(s.top) || 0,
    width: parseFloat(s.width) || 0,
    height: parseFloat(s.height) || 0,
    rotation: m ? parseFloat(m[1]) : 0,
  };
}

function applyDrag(e: OnDrag) {
  e.target.style.left = `${e.left}px`;
  e.target.style.top = `${e.top}px`;
}

function applyResize(e: OnResize) {
  e.target.style.width = `${e.width}px`;
  e.target.style.height = `${e.height}px`;
  e.target.style.left = `${e.drag.left}px`;
  e.target.style.top = `${e.drag.top}px`;
}

function applyRotate(e: OnRotate) {
  e.target.style.transform = `rotate(${e.rotation}deg)`;
}

export function EditorCanvas() {
  const doc = useEditor((s) => s.doc);
  const page = useEditor(currentPage);
  const selectedIds = useEditor((s) => s.selectedIds);
  const zoom = useEditor((s) => s.zoom);
  const select = useEditor((s) => s.select);
  const pushHistory = useEditor((s) => s.pushHistory);
  const updateGeometry = useEditor((s) => s.updateGeometry);
  const setZoom = useEditor((s) => s.setZoom);

  const viewerRef = useRef<InfiniteViewer>(null);
  const moveableRef = useRef<Moveable>(null);
  const selectoRef = useRef<Selecto>(null);

  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [targets, setTargets] = useState<(HTMLElement | SVGElement)[]>([]);
  const [elementGuidelines, setElementGuidelines] = useState<Element[]>([]);

  // Resolve selected ids -> DOM nodes for Moveable.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!viewport) {
        setTargets([]);
        return;
      }
      const nodes = selectedIds
        .map((id) => viewport.querySelector<HTMLElement>(`[data-el-id="${id}"]`))
        .filter((n): n is HTMLElement => n !== null);
      setTargets(nodes);
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedIds, page.elements, viewport]);

  // Resolve snap guideline DOM nodes after the viewport/elements commit.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!viewport) {
        setElementGuidelines([]);
        return;
      }
      setElementGuidelines(
        page.elements
          .map((el) => viewport.querySelector(`[data-el-id="${el.id}"]`))
          .filter((n): n is Element => !!n),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [page.elements, viewport]);

  // Keep Moveable's control box aligned after layout/zoom/page changes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => moveableRef.current?.updateRect());
    return () => cancelAnimationFrame(raf);
  }, [doc, page, zoom, targets]);

  // Center the canvas once on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => viewerRef.current?.scrollCenter());
    return () => cancelAnimationFrame(raf);
  }, []);

  const commitTargets = useCallback(
    (nodes: ArrayLike<Element>) => {
      const patches = Array.from(nodes)
        .map(readGeometry)
        .filter((p): p is GeometryPatch => p !== null);
      if (patches.length) updateGeometry(patches);
    },
    [updateGeometry],
  );

  const isGroup = targets.length > 1;

  // A lone auto-width text "chip" derives its width from content, so only expose
  // vertical resize handles (width handles would do nothing — see store guard).
  const onlyAutoWidth = useMemo(() => {
    if (selectedIds.length !== 1) return false;
    const el = page.elements.find((e) => e.id === selectedIds[0]);
    return el?.type === "text" && !!el.autoWidth;
  }, [selectedIds, page.elements]);

  const changeZoom = useCallback(
    (next: number) => {
      const v = viewerRef.current;
      if (!v) return;
      const z = Math.min(4, Math.max(0.1, next));
      v.setZoom(z);
      setZoom(z);
    },
    [setZoom],
  );

  const zoomPct = useMemo(() => Math.round(zoom * 100), [zoom]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      <InfiniteViewer
        ref={viewerRef}
        className="editor-viewer absolute inset-0 h-full w-full"
        useWheelScroll
        useAutoZoom
        usePinch
        pinchThreshold={50}
        maxPinchWheel={4}
        onPinch={(e) => setZoom(e.zoom)}
      >
        <div
          ref={setViewport}
          className="da-viewport"
          style={{
            position: "relative",
            width: doc.width,
            height: doc.height,
            ...fillToStyle(page.background),
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 10px 40px rgba(0,0,0,0.12)",
          }}
        >
          {page.elements.map((el) => (
            <ElementView key={el.id} el={el} interactive />
          ))}
        </div>
      </InfiniteViewer>

      <Moveable
        ref={moveableRef}
        target={targets}
        draggable
        resizable
        renderDirections={
          onlyAutoWidth ? ["n", "s"] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]
        }
        rotatable
        origin={false}
        throttleDrag={0}
        throttleResize={0}
        throttleRotate={0}
        snappable
        snapThreshold={6}
        // Snap to the artboard (main content box) edges + center, not just to
        // other elements. Guidelines are positions within the snapContainer.
        snapContainer={viewport ?? undefined}
        verticalGuidelines={[0, doc.width / 2, doc.width]}
        horizontalGuidelines={[0, doc.height / 2, doc.height]}
        snapDirections={{
          top: true,
          left: true,
          bottom: true,
          right: true,
          center: true,
          middle: true,
        }}
        elementSnapDirections={{
          top: true,
          left: true,
          bottom: true,
          right: true,
          center: true,
          middle: true,
        }}
        elementGuidelines={elementGuidelines}
        // single-target handlers
        onDragStart={() => !isGroup && pushHistory()}
        onDrag={applyDrag}
        onDragEnd={(e) => commitTargets([e.target])}
        onResizeStart={() => !isGroup && pushHistory()}
        onResize={applyResize}
        onResizeEnd={(e) => commitTargets([e.target])}
        onRotateStart={() => !isGroup && pushHistory()}
        onRotate={applyRotate}
        onRotateEnd={(e) => commitTargets([e.target])}
        // group handlers
        onDragGroupStart={() => pushHistory()}
        onDragGroup={(e: OnDragGroup) => e.events.forEach(applyDrag)}
        onDragGroupEnd={(e) => commitTargets(e.targets)}
        onResizeGroupStart={() => pushHistory()}
        onResizeGroup={(e: OnResizeGroup) => e.events.forEach(applyResize)}
        onResizeGroupEnd={(e) => commitTargets(e.targets)}
        onRotateGroupStart={() => pushHistory()}
        onRotateGroup={(e: OnRotateGroup) => e.events.forEach(applyRotate)}
        onRotateGroupEnd={(e) => commitTargets(e.targets)}
      />

      <Selecto
        ref={selectoRef}
        dragContainer=".editor-viewer"
        selectableTargets={[".da-element"]}
        hitRate={0}
        selectByClick
        selectFromInside={false}
        toggleContinueSelect={["shift"]}
        onDragStart={(e) => {
          const moveable = moveableRef.current;
          const inputTarget = e.inputEvent.target as HTMLElement;
          if (
            moveable?.isMoveableElement(inputTarget) ||
            targets.some((t) => t === inputTarget || t.contains(inputTarget))
          ) {
            e.stop();
          }
        }}
        onSelectEnd={(e) => {
          const ids = e.selected
            .map((el) => el.getAttribute("data-el-id"))
            .filter((id): id is string => id !== null);
          select(ids);
          if (e.isDragStart) {
            e.inputEvent.preventDefault();
            requestAnimationFrame(() => {
              moveableRef.current?.dragStart(e.inputEvent);
            });
          }
        }}
      />

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => changeZoom(zoom - 0.1)}
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">{zoomPct}%</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => changeZoom(zoom + 0.1)}
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => {
            viewerRef.current?.scrollCenter();
          }}
          aria-label="Center canvas"
        >
          <Maximize className="size-4" />
        </Button>
      </div>
    </div>
  );
}
