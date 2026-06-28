"use client";

import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { pageView } from "@/lib/editor/types";
import { TemplatePreview } from "@/components/render/template-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bottom navigator for a design's pages (Canva-style). Click a thumbnail to edit
 * that page; hover reveals reorder / duplicate / delete. Single-page designs still
 * show one thumbnail, so the strip is always present and consistent.
 *
 * All page state lives in the editor store; thumbnails reuse the same
 * <TemplatePreview> the editor and template cards render, projected per page.
 */
export function PageStrip() {
  const doc = useEditor((s) => s.doc);
  const currentPageId = useEditor((s) => s.currentPageId);
  const setCurrentPage = useEditor((s) => s.setCurrentPage);
  const addPage = useEditor((s) => s.addPage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const removePage = useEditor((s) => s.removePage);
  const movePage = useEditor((s) => s.movePage);

  // Keep thumbnails honest to the design's aspect ratio at a fixed height.
  const aspectRatio = `${doc.width} / ${doc.height}`;
  const canDelete = doc.pages.length > 1;

  return (
    <div className="flex h-28 shrink-0 items-center gap-3 overflow-x-auto border-t bg-background px-3">
      {doc.pages.map((page, i) => {
        const active = page.id === currentPageId;
        return (
          <div key={page.id} className="group/page relative flex h-full flex-col justify-center">
            <button
              type="button"
              onClick={() => setCurrentPage(page.id)}
              aria-label={`Edit page ${i + 1}`}
              aria-current={active}
              className={cn(
                "relative block h-20 overflow-hidden rounded-md border bg-muted outline-none transition-shadow",
                active
                  ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                  : "hover:border-foreground/30",
              )}
              style={{ aspectRatio }}
            >
              <TemplatePreview canvas={pageView(doc, page)} className="h-full w-full" />
            </button>

            {/* Always-visible page number. */}
            <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px] font-medium tabular-nums text-muted-foreground backdrop-blur">
              {i + 1}
            </span>

            {/* Hover controls: reorder / duplicate / delete. */}
            <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover/page:opacity-100 focus-within:opacity-100">
              <IconBtn
                label="Move page left"
                disabled={i === 0}
                onClick={() => movePage(page.id, "left")}
              >
                <ChevronLeft className="size-3.5" />
              </IconBtn>
              <IconBtn
                label="Move page right"
                disabled={i === doc.pages.length - 1}
                onClick={() => movePage(page.id, "right")}
              >
                <ChevronRight className="size-3.5" />
              </IconBtn>
              <IconBtn label="Duplicate page" onClick={() => duplicatePage(page.id)}>
                <Copy className="size-3.5" />
              </IconBtn>
              <IconBtn
                label="Delete page"
                disabled={!canDelete}
                onClick={() => removePage(page.id)}
              >
                <Trash2 className="size-3.5" />
              </IconBtn>
            </div>
          </div>
        );
      })}

      {/* Add a new page after the current one. */}
      <button
        type="button"
        onClick={addPage}
        aria-label="Add page"
        title="Add page"
        className="flex h-20 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40 px-4 text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        style={{ aspectRatio }}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-6 shadow-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
