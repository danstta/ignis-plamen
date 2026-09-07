"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the run page's review pickers (select-images,
 * preview-design-image, manual-review). All three are the same shape — a
 * sticky action bar, a column of image sections, and an optional sticky
 * preview — so the layout lives here rather than being re-derived, and drifting,
 * in every plugin.
 */

/**
 * The one tile size every picker grid snaps to. Auto-fill against the width the
 * grid actually gets rather than a viewport breakpoint, so sections stacked in
 * the same column (selected slots above alternates, one query group above the
 * next) land on identical columns whatever the preview aside leaves over.
 */
const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3";

/** Height the sticky toolbar occupies; the preview aside sticks below it. */
const ASIDE_STICKY_TOP = "top-14";

/**
 * Picker shell: full-width action bar over a content column, plus a preview
 * column that sticks on wide screens. Without `aside` the content spans the
 * full width instead of leaving a gap where the preview would be.
 */
export function PickerLayout({
  toolbar,
  aside,
  children,
}: {
  toolbar?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  if (!aside) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,26rem)]">
        <div className="min-w-0 space-y-5">{children}</div>
        <aside className="min-w-0">
          <div className={cn("sticky space-y-2", ASIDE_STICKY_TOP)}>{aside}</div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Sticky action bar: selection status on the left, the picker's actions on the
 * right, so submitting never means scrolling back up past the alternates. The
 * negative inline margin matches the admin shell's page padding so tiles scroll
 * behind the bar instead of past its edges.
 */
export function PickerToolbar({
  status,
  children,
}: {
  status: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-8 flex items-center justify-between gap-3 bg-background px-8 py-2.5">
      <div className="min-w-0 truncate text-xs text-muted-foreground">
        {status}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * One image section: heading, an optional count or hint beside it, and optional
 * controls (paging, filters) pinned to the right of the same row.
 */
export function PickerSection({
  title,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-xs font-medium text-foreground">
            {title}
          </h3>
          {meta !== undefined && meta !== null ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Image tiles on the shared column grid. See {@link TILE_GRID}. */
export function TileGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(TILE_GRID, className)}>{children}</div>;
}
