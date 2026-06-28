"use client";

import { useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { currentPage, useEditor } from "@/lib/editor/store";
import { useAutosave } from "@/lib/hooks/use-autosave";
import type { TemplateDoc } from "@/lib/editor/types";
import type { Brand } from "@/lib/brand/types";
import { EditorToolbar } from "./editor-toolbar";
import { PageStrip } from "./page-strip";
import { PropertiesPanel } from "./properties-panel";

// The canvas pulls in Moveable/Selecto/InfiniteViewer — load it client-only.
const EditorCanvas = dynamic(
  () => import("./editor-canvas").then((m) => m.EditorCanvas),
  { ssr: false },
);

export type EditorTemplate = {
  id: string | null;
  name: string;
  doc: TemplateDoc;
};

export function Editor({
  template,
  brands = [],
}: {
  template: EditorTemplate;
  brands?: Brand[];
}) {
  const load = useEditor((s) => s.load);
  const setBrands = useEditor((s) => s.setBrands);

  useEffect(() => {
    load(template);
  }, [template, load]);

  useEffect(() => {
    setBrands(brands);
  }, [brands, setBrands]);

  const save = useCallback(async ({ auto }: { auto: boolean }) => {
    const build = (s: ReturnType<typeof useEditor.getState>) => ({
      name: s.name,
      width: s.doc.width,
      height: s.doc.height,
      doc: s.doc,
    });
    const st = useEditor.getState();
    const payload = build(st);
    const snapshot = JSON.stringify(payload);
    const res = st.templateId
      ? await fetch(`/api/templates/${st.templateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!st.templateId && data?.id) {
      useEditor.setState({ templateId: data.id });
      window.history.replaceState(null, "", `/editor/${data.id}`);
    }
    // Only mark clean if nothing changed while the request was in flight,
    // so edits made mid-save aren't dropped (a follow-up autosave catches them).
    const after = useEditor.getState();
    if (JSON.stringify(build(after)) === snapshot) after.markSaved();
    if (!auto) toast.success("Template saved");
  }, []);

  const { status, saveNow } = useAutosave({ store: useEditor, save });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable;
      const meta = e.metaKey || e.ctrlKey;
      const st = useEditor.getState();

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        return;
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.duplicateSelected();
        return;
      }
      if (typing) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        st.removeSelected();
        return;
      }
      if (e.key === "Escape") {
        st.clearSelection();
        return;
      }

      if (
        st.selectedIds.length > 0 &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        st.pushHistory();
        const els = currentPage(st).elements;
        st.updateGeometry(
          st.selectedIds.map((id) => {
            const el = els.find((x) => x.id === id)!;
            return { id, x: el.x + dx, y: el.y + dy };
          }),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  return (
    <div className="flex h-svh flex-col">
      <EditorToolbar onSave={saveNow} status={status} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <EditorCanvas />
          </div>
          <PageStrip />
        </div>
        <aside className="w-72 shrink-0 overflow-auto border-l bg-background">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
