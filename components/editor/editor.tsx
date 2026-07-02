"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Download, Save } from "lucide-react";
import { currentPage, useEditor } from "@/lib/editor/store";
import { useAutosave } from "@/lib/hooks/use-autosave";
import type { TemplateDoc } from "@/lib/editor/types";
import type { Brand } from "@/lib/brand/types";
import { generateReactComponent } from "@/lib/codegen/react";
import { generateHtml } from "@/lib/codegen/html";
import { toComponentName } from "@/lib/codegen/serialize";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const name = useEditor((s) => s.name);
  const setName = useEditor((s) => s.setName);
  const [exporting, setExporting] = useState(false);
  const saving = status === "saving";
  const saveStatusLabel =
    status === "saved"
      ? "All changes saved"
      : status === "saving"
        ? "Saving changes"
        : "Unsaved changes";
  const saveStatusClassName = cn(
    "border transition-colors disabled:opacity-100",
    status === "saved" &&
      "border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-700 hover:bg-emerald-500/[0.12] dark:text-emerald-300",
    status === "saving" &&
      "border-sky-500/15 bg-sky-500/[0.08] text-sky-700 hover:bg-sky-500/[0.12] dark:text-sky-300",
    status === "unsaved" &&
      "border-amber-500/20 bg-amber-500/[0.09] text-amber-700 hover:bg-amber-500/[0.13] dark:text-amber-300",
  );

  async function exportPng() {
    const st = useEditor.getState();
    const base = st.name || "template";
    const count = st.doc.pages.length;
    setExporting(true);
    try {
      for (let i = 0; i < count; i++) {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc: st.doc, page: i }),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = count === 1 ? `${base}.png` : `${base}-${i + 1}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      toast.success(count === 1 ? "Exported PNG" : `Exported ${count} PNGs`);
    } catch (err) {
      toast.error("Export failed", { description: String(err) });
    } finally {
      setExporting(false);
    }
  }

  function downloadText(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportReact() {
    const st = useEditor.getState();
    downloadText(
      `${toComponentName(st.name)}.tsx`,
      generateReactComponent(st.doc, st.name),
      "text/plain;charset=utf-8",
    );
    toast.success("Exported React component");
  }

  function exportHtml() {
    const st = useEditor.getState();
    downloadText(
      `${st.name || "template"}.html`,
      generateHtml(st.doc),
      "text/html;charset=utf-8",
    );
    toast.success("Exported HTML");
  }

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
    <div className="flex h-svh">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <EditorCanvas />
          <EditorToolbar />
        </div>
        <PageStrip />
      </div>
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 min-w-0 flex-1 font-medium"
            aria-label="Template name"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={exporting}
                  title={exporting ? "Exporting" : "Export"}
                  aria-label={exporting ? "Exporting" : "Export"}
                />
              }
            >
              <Download className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPng}>PNG image</DropdownMenuItem>
              <DropdownMenuItem onClick={exportReact}>
                React component (.tsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportHtml}>HTML (.html)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon-sm"
            className={saveStatusClassName}
            onClick={saveNow}
            disabled={saving}
            title={saveStatusLabel}
            aria-label={saveStatusLabel}
            aria-busy={saving}
          >
            <Save className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <PropertiesPanel />
        </div>
      </aside>
    </div>
  );
}
