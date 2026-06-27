"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Braces,
  Tag,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  Save,
  Download,
} from "lucide-react";
import { activeBrand, useEditor } from "@/lib/editor/store";
import {
  createImage,
  createShape,
  createText,
  createTextChip,
} from "@/lib/editor/factory";
import { CANVAS_PRESETS, type CanvasPreset } from "@/lib/editor/types";
import { generateReactComponent } from "@/lib/codegen/react";
import { generateHtml } from "@/lib/codegen/html";
import { toComponentName } from "@/lib/codegen/serialize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AssetsPanel } from "./assets-panel";
import { SaveStatusDot } from "@/components/ui/save-status-dot";
import type { SaveStatus } from "@/lib/hooks/use-autosave";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EditorToolbar({
  onSave,
  status,
}: {
  onSave: () => void;
  status: SaveStatus;
}) {
  const saving = status === "saving";
  const name = useEditor((s) => s.name);
  const setName = useEditor((s) => s.setName);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const doc = useEditor((s) => s.doc);
  const setCanvasSize = useEditor((s) => s.setCanvasSize);
  const brandLogoUrl = useEditor((s) => activeBrand(s)?.logoUrl ?? null);
  const [exporting, setExporting] = useState(false);

  async function exportPng() {
    const st = useEditor.getState();
    setExporting(true);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: st.doc }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${st.name || "template"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported PNG");
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

  function add(kind: "text" | "image" | "shape-rect" | "shape-ellipse") {
    const state = useEditor.getState();
    const d = state.doc;
    const el =
      kind === "text"
        ? createText(d)
        : kind === "image"
          ? createImage(d)
          : createShape(d, kind === "shape-ellipse" ? "ellipse" : "rect");
    state.addElement(el);
    state.select([el.id]);
  }

  function addBrandLogo() {
    if (!brandLogoUrl) return;
    const state = useEditor.getState();
    const el = createImage(state.doc, { src: brandLogoUrl });
    state.addElement(el);
    state.select([el.id]);
  }

  function addTextChip() {
    const key = window.prompt(
      'Name the chip placeholder (e.g. "location") — leave blank for fixed text',
    );
    if (key === null) return;
    const state = useEditor.getState();
    const el = createTextChip(state.doc, { placeholderKey: key || undefined });
    state.addElement(el);
    state.select([el.id]);
  }

  function addPlaceholder(kind: "text" | "image") {
    const key = window.prompt(
      `Name the ${kind} placeholder (e.g. "title", "background")`,
    );
    if (!key) return;
    const state = useEditor.getState();
    const d = state.doc;
    const el =
      kind === "text"
        ? createText(d, { placeholderKey: key })
        : createImage(d, { placeholderKey: key });
    state.addElement(el);
    state.select([el.id]);
  }

  const currentPreset = (Object.keys(CANVAS_PRESETS) as CanvasPreset[]).find(
    (p) =>
      CANVAS_PRESETS[p].width === doc.width &&
      CANVAS_PRESETS[p].height === doc.height,
  );

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        render={<Link href="/templates" aria-label="Back to templates" />}
      >
        <ArrowLeft className="size-4" />
      </Button>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-56"
        aria-label="Template name"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="h-8 gap-1" />}
        >
          <Plus className="size-4" /> Add
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Elements</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => add("text")}>
              <Type className="size-4" /> Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => add("image")}>
              <ImageIcon className="size-4" /> Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => add("shape-rect")}>
              <Square className="size-4" /> Rectangle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => add("shape-ellipse")}>
              <Circle className="size-4" /> Ellipse
            </DropdownMenuItem>
            {brandLogoUrl ? (
              <DropdownMenuItem onClick={addBrandLogo}>
                <Sparkles className="size-4" /> Brand logo
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Placeholders</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => addPlaceholder("text")}>
              <Braces className="size-4" /> Text placeholder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addPlaceholder("image")}>
              <Braces className="size-4" /> Image placeholder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addTextChip}>
              <Tag className="size-4" /> Text chip (auto width)
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AssetsPanel />

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <Redo2 className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Select
        value={currentPreset ?? "custom"}
        onValueChange={(v) => {
          if (!v || v === "custom") return;
          const preset = CANVAS_PRESETS[v as CanvasPreset];
          setCanvasSize(preset.width, preset.height);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(CANVAS_PRESETS) as CanvasPreset[]).map((p) => (
            <SelectItem key={p} value={p}>
              {CANVAS_PRESETS[p].label}
            </SelectItem>
          ))}
          {!currentPreset ? (
            <SelectItem value="custom">
              Custom ({doc.width}×{doc.height})
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={exporting}
              />
            }
          >
            <Download className="size-4" />
            {exporting ? "Exporting…" : "Export"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportPng}>PNG image</DropdownMenuItem>
            <DropdownMenuItem onClick={exportReact}>
              React component (.tsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportHtml}>HTML (.html)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SaveStatusDot status={status} />
        <Button size="sm" className="h-8 gap-1" onClick={onSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
