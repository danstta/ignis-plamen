"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Blocks,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Palette,
  Plug,
  Plus,
  Search,
  Settings,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** Dispatch from anywhere (e.g. the sidebar Search button) to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

type CommandItem = {
  id: string;
  group: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Extra terms to match against (not shown). */
  keywords?: string;
};

const PAGES: CommandItem[] = [
  { id: "page-dashboard", group: "Go to", label: "Dashboard", href: "/", icon: <LayoutDashboard className="size-4" />, keywords: "home overview" },
  { id: "page-templates", group: "Go to", label: "Templates", href: "/templates", icon: <LayoutTemplate className="size-4" /> },
  { id: "page-workflows", group: "Go to", label: "Workflows", href: "/workflows", icon: <Workflow className="size-4" /> },
  { id: "page-runs", group: "Go to", label: "Runs", href: "/runs", icon: <Activity className="size-4" />, keywords: "executions history" },
  { id: "page-brand", group: "Go to", label: "Brand", href: "/brand", icon: <Palette className="size-4" /> },
  { id: "page-assets", group: "Go to", label: "Assets", href: "/assets", icon: <Images className="size-4" /> },
  { id: "page-plugins", group: "Go to", label: "Plugins", href: "/plugins", icon: <Blocks className="size-4" /> },
  { id: "page-connections", group: "Go to", label: "Connections", href: "/settings/connections", icon: <Plug className="size-4" /> },
  { id: "page-settings", group: "Go to", label: "Settings", href: "/settings", icon: <Settings className="size-4" /> },
  { id: "new-template", group: "Create", label: "New template", href: "/editor/new", icon: <Plus className="size-4" />, keywords: "add design" },
  { id: "new-workflow", group: "Create", label: "New workflow", href: "/workflows/new", icon: <Plus className="size-4" />, keywords: "add automation" },
];

/**
 * App-wide quick navigation (⌘K / Ctrl+K). Jumps to any page, template, or
 * workflow. Mounted once in the admin layout; opened by the shortcut or via
 * `openCommandPalette()` (the sidebar Search button).
 */
export function CommandPalette({
  templates,
  workflows,
}: {
  templates: { id: string; name: string }[];
  workflows: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  const items = useMemo<CommandItem[]>(
    () => [
      ...PAGES,
      ...templates.map((t) => ({
        id: `tpl-${t.id}`,
        group: "Templates",
        label: t.name,
        href: `/editor/${t.id}`,
        icon: <LayoutTemplate className="size-4" />,
      })),
      ...workflows.map((w) => ({
        id: `wf-${w.id}`,
        group: "Workflows",
        label: w.name,
        href: `/workflows/${w.id}`,
        icon: <Workflow className="size-4" />,
      })),
    ],
    [templates, workflows],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      `${it.label} ${it.keywords ?? ""}`.toLowerCase().includes(term),
    );
  }, [items, query]);

  // Open with ⌘K/Ctrl+K, or when something dispatches the open event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Keep the highlighted row in view as you arrow through.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function select(item: CommandItem) {
    handleOpenChange(false);
    router.push(item.href);
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
      if (item) select(item);
    }
  }

  let lastGroup: string | null = null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search templates, workflows, pages…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
        </div>

        <div className="max-h-[min(60vh,360px)] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for “{query}”.
            </p>
          ) : (
            filtered.map((item, i) => {
              const header =
                item.group !== lastGroup ? (
                  <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground/70">
                    {item.group}
                  </div>
                ) : null;
              lastGroup = item.group;
              const active = i === activeIndex;
              return (
                <Fragment key={item.id}>
                  {header}
                  <button
                    type="button"
                    ref={active ? activeRef : undefined}
                    onClick={() => select(item)}
                    onMouseMove={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
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
