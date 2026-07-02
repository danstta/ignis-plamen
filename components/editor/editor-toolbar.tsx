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
  Triangle,
  Diamond,
  Hexagon,
  Star,
  ArrowRight,
  Minus,
  Shapes as ShapesIcon,
  Braces,
  Tag,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  Save,
  Download,
  type LucideIcon,
} from "lucide-react";
import { activeBrand, useEditor } from "@/lib/editor/store";
import {
  createImage,
  createLine,
  createShape,
  createText,
  createTextChip,
} from "@/lib/editor/factory";
import {
  CANVAS_PRESETS,
  type CanvasPreset,
  type TemplateDoc,
  type TemplateElement,
} from "@/lib/editor/types";
import { generateReactComponent } from "@/lib/codegen/react";
import { generateHtml } from "@/lib/codegen/html";
import { toComponentName } from "@/lib/codegen/serialize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AssetsPanel } from "./assets-panel";
import type { SaveStatus } from "@/lib/hooks/use-autosave";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The "Shapes" menu, as data so the dropdown is a single map. Each item builds
 * its element from the active doc; "Line" is a rect preset (see {@link createLine}),
 * everything else is a {@link createShape} kind.
 */
const SHAPE_ITEMS: {
  label: string;
  icon: LucideIcon;
  make: (doc: TemplateDoc) => TemplateElement;
}[] = [
  { label: "Rectangle", icon: Square, make: (d) => createShape(d, "rect") },
  { label: "Ellipse", icon: Circle, make: (d) => createShape(d, "ellipse") },
  { label: "Triangle", icon: Triangle, make: (d) => createShape(d, "triangle") },
  { label: "Line", icon: Minus, make: createLine },
  { label: "Diamond", icon: Diamond, make: (d) => createShape(d, "diamond") },
  { label: "Hexagon", icon: Hexagon, make: (d) => createShape(d, "hexagon") },
  { label: "Star", icon: Star, make: (d) => createShape(d, "star") },
  { label: "Arrow", icon: ArrowRight, make: (d) => createShape(d, "arrow") },
];

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
  const saveStatusLabel =
    status === "saved"
      ? "All changes saved"
      : status === "saving"
        ? "Saving changes"
        : "Unsaved changes";
  const saveStatusClassName = cn(
    "h-8 gap-1 border transition-colors disabled:opacity-100",
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
      // One PNG per page (each page is rendered server-side by index).
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

  /** Build an element from the active doc, add it, and select it. */
  function insert(make: (doc: TemplateDoc) => TemplateElement) {
    const state = useEditor.getState();
    const el = make(state.doc);
    state.addElement(el);
    state.select([el.id]);
  }

  function addTextChip() {
    const key = window.prompt(
      'Name the chip placeholder (e.g. "location") — leave blank for fixed text',
    );
    if (key === null) return;
    insert((d) => createTextChip(d, { placeholderKey: key || undefined }));
  }

  function addPlaceholder(kind: "text" | "image") {
    const key = window.prompt(
      `Name the ${kind} placeholder (e.g. "title", "background")`,
    );
    if (!key) return;
    insert((d) =>
      kind === "text"
        ? createText(d, { placeholderKey: key })
        : createImage(d, { placeholderKey: key }),
    );
  }

  const currentPreset = (Object.keys(CANVAS_PRESETS) as CanvasPreset[]).find(
    (p) =>
      CANVAS_PRESETS[p].width === doc.width &&
      CANVAS_PRESETS[p].height === doc.height,
  );

  return (
    <div className="relative flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        render={<Link href="/templates" aria-label="Back to templates" />}
      >
        <ArrowLeft className="size-4" />
      </Button>

      <div className="flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-sm shadow-black/5 backdrop-blur">
        <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="h-8 gap-1" />}
        >
          <ShapesIcon className="size-4" /> Shapes
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SHAPE_ITEMS.map(({ label, icon: Icon, make }) => (
            <DropdownMenuItem key={label} onClick={() => insert(make)}>
              <Icon className="size-4" /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="h-8 gap-1" />}
        >
          <Plus className="size-4" /> Elements
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => insert(createText)}>
            <Type className="size-4" /> Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insert(createImage)}>
            <ImageIcon className="size-4" /> Image
          </DropdownMenuItem>
          {brandLogoUrl ? (
            <DropdownMenuItem
              onClick={() => insert((d) => createImage(d, { src: brandLogoUrl }))}
            >
              <Sparkles className="size-4" /> Brand logo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="h-8 gap-1" />}
        >
          <Braces className="size-4" /> Placeholders
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => addPlaceholder("text")}>
            <Braces className="size-4" /> Text placeholder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPlaceholder("image")}>
            <Braces className="size-4" /> Image placeholder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addTextChip}>
            <Tag className="size-4" /> Text chip (auto width)
          </DropdownMenuItem>
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

      <Separator orientation="vertical" className="mx-1 h-5" />

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
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-56"
          aria-label="Template name"
        />
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
        <Button
          size="sm"
          variant="outline"
          className={saveStatusClassName}
          onClick={onSave}
          disabled={saving}
          title={saveStatusLabel}
          aria-label={saveStatusLabel}
          aria-busy={saving}
        >
          <Save className="size-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
