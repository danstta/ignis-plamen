"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { listNodeCatalog } from "@/lib/nodes/catalog";
import { NODE_GROUP_LABELS, groupNodes } from "@/lib/nodes/grouping";
import type { NodeMeta } from "@/lib/nodes/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Searchable "choose a step" modal, opened from the + button on a canvas
 * connector. Lists the enabled step node types grouped like the sidebar
 * palette; picking one calls `onPick` and closes.
 */
export function NodePickerDialog({
  open,
  onOpenChange,
  enabledNodeTypeIds,
  excludeTypeIds = [],
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabledNodeTypeIds: string[];
  /** Node types hidden for this insertion point (e.g. no router inside a branch). */
  excludeTypeIds?: string[];
  onPick: (nodeTypeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Reset the highlight when the query changes — adjusting state during render
  // (rather than in an effect) avoids an extra commit and a cascading render.
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  const items = useMemo(() => {
    const enabled = new Set(enabledNodeTypeIds);
    const excluded = new Set(excludeTypeIds);
    const steps = listNodeCatalog().filter(
      (t) =>
        enabled.has(t.id) && !excluded.has(t.id) && t.category !== "trigger",
    );
    return groupNodes(steps).flatMap(({ group, nodes }) =>
      nodes.map((meta) => ({ meta, group })),
    );
  }, [enabledNodeTypeIds, excludeTypeIds]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(({ meta }) =>
      `${meta.label} ${meta.description}`.toLowerCase().includes(term),
    );
  }, [items, query]);

  // Keep the highlighted row in view as you arrow through.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function select(meta: NodeMeta) {
    handleOpenChange(false);
    onPick(meta.id);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) select(item.meta);
    }
  }

  let lastGroup: string | null = null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogTitle className="sr-only">Add a step</DialogTitle>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search steps…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search steps"
          />
        </div>

        <div className="max-h-[min(60vh,400px)] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "No step nodes enabled. Turn on a plugin in Plugins."
                : `No results for “${query}”.`}
            </p>
          ) : (
            filtered.map((item, i) => {
              const header =
                item.group !== lastGroup ? (
                  <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground/70">
                    {NODE_GROUP_LABELS[item.group]}
                  </div>
                ) : null;
              lastGroup = item.group;
              const active = i === activeIndex;
              return (
                <Fragment key={item.meta.id}>
                  {header}
                  <button
                    type="button"
                    ref={active ? activeRef : undefined}
                    onClick={() => select(item.meta)}
                    onMouseMove={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm outline-none",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground",
                    )}
                  >
                    <span className="truncate text-[13px] font-medium leading-5">
                      {item.meta.label}
                    </span>
                    <span className="truncate text-[11px] leading-4 text-muted-foreground">
                      {item.meta.description}
                    </span>
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
