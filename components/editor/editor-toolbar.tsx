"use client";

import Link from "next/link";
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
  List,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { activeBrand, useEditor } from "@/lib/editor/store";
import {
  createImage,
  createLine,
  createList,
  createShape,
  createText,
  createTextChip,
} from "@/lib/editor/factory";
import type { TemplateDoc, TemplateElement } from "@/lib/editor/types";
import { Button } from "@/components/ui/button";
import { AssetsPanel } from "./assets-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function EditorToolbar() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const brandLogoUrl = useEditor((s) => activeBrand(s)?.logoUrl ?? null);

  function insert(make: (doc: TemplateDoc) => TemplateElement) {
    const state = useEditor.getState();
    const el = make(state.doc);
    state.addElement(el);
    state.select([el.id]);
  }

  function addTextChip() {
    const key = window.prompt(
      'Name the chip placeholder (e.g. "location") - leave blank for fixed text',
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

  function addList() {
    const key = window.prompt(
      'Name the list placeholder (e.g. "participants") - leave blank for a fixed list',
    );
    if (key === null) return;
    insert((d) => createList(d, { placeholderKey: key || undefined }));
  }

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex justify-center">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border bg-background/90 p-1 shadow-sm shadow-black/10 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/templates" aria-label="Back to templates" />}
        >
          <ArrowLeft className="size-4" />
        </Button>

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
            <DropdownMenuItem onClick={addList}>
              <List className="size-4" /> List (fits array data)
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
      </div>
    </div>
  );
}
