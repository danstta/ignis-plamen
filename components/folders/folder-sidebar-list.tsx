"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FolderPlus,
  LayoutTemplate,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import {
  createFolderAction,
  moveFolderItemAction,
} from "@/app/(admin)/folders/actions";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/assets/types";
import type { FolderItem, FolderKind, FolderSummary } from "@/lib/folders/types";
import {
  getFolderDragPayload,
  hasFolderDragPayload,
  type FolderDragPayload,
  setFolderDragPayload,
} from "@/components/folders/drag-data";
import {
  FolderContextMenu,
  FolderItemContextMenu,
  FolderVisual,
} from "@/components/folders/folder-context-menu";

export type SidebarFolderItem = FolderItem & {
  href: string;
  active?: boolean;
  trailing?: React.ReactNode;
};

export function FolderSidebarList({
  kind,
  folders,
  items,
  assets,
}: {
  kind: FolderKind;
  folders: FolderSummary[];
  items: SidebarFolderItem[];
  assets: Asset[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<FolderDragPayload | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const itemIcon =
    kind === "design" ? (
      <LayoutTemplate className="size-4 shrink-0" />
    ) : (
      <Workflow className="size-4 shrink-0" />
    );

  const itemsByFolder = useMemo(() => {
    const map = new Map<string | null, SidebarFolderItem[]>();
    for (const item of items) {
      const key = item.folderId ?? null;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const moveItem = (itemId: string, folderId: string | null) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.folderId === folderId) return;
    startTransition(async () => {
      try {
        await moveFolderItemAction({ kind, itemId, folderId });
        router.refresh();
      } catch (err) {
        toast.error("Move failed", { description: String(err) });
      }
    });
  };

  const createFolder = () => {
    const name = window.prompt(
      kind === "design" ? "Design folder name" : "Workflow folder name",
    );
    if (name === null) return;
    startTransition(async () => {
      try {
        await createFolderAction(kind, name);
        toast.success("Folder created");
        router.refresh();
      } catch (err) {
        toast.error("Folder not created", { description: String(err) });
      }
    });
  };

  const renderDropTarget = ({
    id,
    label,
    folderId,
    children,
  }: {
    id: string;
    label: string;
    folderId: string | null;
    children: React.ReactNode;
  }) => (
    <div
      key={id}
      onDragOver={(event) => {
        const canDrop = activeDrag?.kind === kind || hasFolderDragPayload(event);
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(event) => {
        if (activeDrag?.kind === kind || hasFolderDragPayload(event)) {
          setDropTarget(id);
        }
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(event) => {
        const payload = activeDrag ?? getFolderDragPayload(event);
        setDropTarget(null);
        if (payload?.kind !== kind) return;
        event.preventDefault();
        moveItem(payload.itemId, folderId);
      }}
      data-dropping={dropTarget === id || undefined}
      className={cn(
        "rounded-md border border-transparent p-1 transition-colors",
        "data-dropping:border-sidebar-ring data-dropping:bg-sidebar-accent",
      )}
      aria-label={`Drop into ${label}`}
    >
      {children}
    </div>
  );

  const unfiled = itemsByFolder.get(null) ?? [];
  const toggleFolder = (id: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (folders.length === 0 && items.length === 0) {
    return (
      <>
        <FolderHeader
          label={kind === "design" ? "Designs" : "Workflows"}
          disabled={isPending}
          onCreateFolder={createFolder}
        />
        <p className="px-2.5 py-1.5 text-sm text-muted-foreground/60">
          {kind === "design" ? "No designs yet." : "No workflows yet."}
        </p>
      </>
    );
  }

  return (
    <>
      <FolderHeader
        label={kind === "design" ? "Designs" : "Workflows"}
        disabled={isPending}
        onCreateFolder={createFolder}
      />

      {folders.map((folder) => {
        const folderItems = itemsByFolder.get(folder.id) ?? [];
        const collapsed = collapsedFolders.has(folder.id);
        return renderDropTarget({
          id: folder.id,
          label: folder.name,
          folderId: folder.id,
          children: (
            <div className="flex flex-col gap-0.5">
              <FolderContextMenu kind={kind} folder={folder} assets={assets}>
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform",
                      !collapsed && "rotate-90",
                    )}
                  />
                  <FolderVisual folder={folder} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {folderItems.length}
                  </span>
                </button>
              </FolderContextMenu>
              {collapsed
                ? null
                : folderItems.map((item) => (
                    <FolderItemLink
                      key={item.id}
                      kind={kind}
                      item={item}
                      icon={itemIcon}
                      folders={folders}
                      onDragStart={setActiveDrag}
                      onDragEnd={() => setActiveDrag(null)}
                    />
                  ))}
            </div>
          ),
        });
      })}

      {unfiled.length > 0
        ? renderDropTarget({
            id: "top-level",
            label: kind === "design" ? "Designs" : "Workflows",
            folderId: null,
            children: (
              <div className="flex flex-col gap-0.5">
                {unfiled.map((item) => (
                  <FolderItemLink
                    key={item.id}
                    kind={kind}
                    item={item}
                    icon={itemIcon}
                    folders={folders}
                    onDragStart={setActiveDrag}
                    onDragEnd={() => setActiveDrag(null)}
                  />
                ))}
              </div>
            ),
          })
        : null}
    </>
  );
}

function FolderHeader({
  label,
  disabled,
  onCreateFolder,
}: {
  label: string;
  disabled: boolean;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-2.5 pt-4 pb-1">
      <div className="min-w-0 flex-1 text-xs font-medium tracking-wide text-muted-foreground/70">
        {label}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onCreateFolder}
        title={`New ${label.toLowerCase()} folder`}
        aria-label={`New ${label.toLowerCase()} folder`}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
      >
        <FolderPlus className="size-3.5" />
      </button>
    </div>
  );
}

function FolderItemLink({
  kind,
  item,
  icon,
  folders,
  onDragStart,
  onDragEnd,
}: {
  kind: FolderKind;
  item: SidebarFolderItem;
  icon: React.ReactNode;
  folders: FolderSummary[];
  onDragStart: (payload: FolderDragPayload) => void;
  onDragEnd: () => void;
}) {
  const payload = { kind, itemId: item.id };
  return (
    <FolderItemContextMenu kind={kind} item={item} folders={folders}>
      <Link
        href={item.href}
        draggable
        onDragStart={(event) => {
          onDragStart(payload);
          setFolderDragPayload(event, payload);
        }}
        onDragEnd={onDragEnd}
        aria-current={item.active ? "page" : undefined}
        data-active={item.active || undefined}
        className={cn(
          "ml-3 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {item.trailing}
      </Link>
    </FolderItemContextMenu>
  );
}
