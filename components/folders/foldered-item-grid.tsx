"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderPlus } from "lucide-react";
import { toast } from "sonner";

import {
  createFolderAction,
  moveFolderItemAction,
} from "@/app/(admin)/folders/actions";
import { Button } from "@/components/ui/button";
import {
  getFolderDragPayload,
  hasFolderDragPayload,
  type FolderDragPayload,
  setFolderDragPayload,
} from "@/components/folders/drag-data";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/assets/types";
import type { FolderItem, FolderKind, FolderSummary } from "@/lib/folders/types";
import {
  FolderContextMenu,
  FolderItemContextMenu,
  FolderVisual,
} from "@/components/folders/folder-context-menu";

export function FolderedItemGrid<TItem extends FolderItem>({
  kind,
  folders,
  items,
  emptyLabel,
  gridClassName,
  assets,
  renderItem,
}: {
  kind: FolderKind;
  folders: FolderSummary[];
  items: TItem[];
  emptyLabel: string;
  gridClassName: string;
  assets: Asset[];
  renderItem: (item: TItem) => React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<FolderDragPayload | null>(null);

  const itemsByFolder = useMemo(() => {
    const map = new Map<string | null, TItem[]>();
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

  const renderSection = ({
    id,
    folderId,
    folder,
    title,
    items: sectionItems,
    topLevel,
  }: {
    id: string;
    folderId: string | null;
    folder?: FolderSummary;
    title: string;
    items: TItem[];
    topLevel?: boolean;
  }) => (
    <section
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
        "rounded-lg border border-transparent p-3 transition-colors",
        "data-dropping:border-ring data-dropping:bg-muted/70",
      )}
      aria-label={`Drop into ${title}`}
    >
      {folder ? (
        <FolderContextMenu kind={kind} folder={folder} assets={assets}>
          <SectionHeader
            title={title}
            count={sectionItems.length}
            folder={folder}
          />
        </FolderContextMenu>
      ) : (
        <SectionHeader title={title} count={sectionItems.length} topLevel={topLevel} />
      )}

      {sectionItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Drop items here.
        </div>
      ) : (
        <div className={gridClassName}>
          {sectionItems.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(event) => {
                const payload = { kind, itemId: item.id };
                setActiveDrag(payload);
                setFolderDragPayload(event, payload);
              }}
              onDragEnd={() => setActiveDrag(null)}
              className="cursor-grab active:cursor-grabbing"
            >
              <FolderItemContextMenu kind={kind} item={item} folders={folders}>
                {renderItem(item)}
              </FolderItemContextMenu>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  if (items.length === 0) {
    return (
      <div className="mt-6">
        <FolderToolbar isPending={isPending} onCreateFolder={createFolder} />
        <div className="mt-4 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      </div>
    );
  }

  const unfiled = itemsByFolder.get(null) ?? [];

  return (
    <div className="mt-6">
      <FolderToolbar isPending={isPending} onCreateFolder={createFolder} />
      <div className="mt-4 space-y-4">
        {folders.map((folder) =>
          renderSection({
            id: folder.id,
            folderId: folder.id,
            folder,
            title: folder.name,
            items: itemsByFolder.get(folder.id) ?? [],
          }),
        )}
        {unfiled.length > 0 || folders.length === 0
          ? renderSection({
              id: "top-level",
              folderId: null,
              title: kind === "design" ? "Designs" : "Workflows",
              items: unfiled,
              topLevel: true,
            })
          : null}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  folder,
  topLevel,
}: {
  title: string;
  count: number;
  folder?: FolderSummary;
  topLevel?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {folder ? (
        <FolderVisual folder={folder} className="size-4 text-muted-foreground" />
      ) : topLevel ? (
        null
      ) : (
        <Folder className="size-4 text-muted-foreground" />
      )}
      <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

function FolderToolbar({
  isPending,
  onCreateFolder,
}: {
  isPending: boolean;
  onCreateFolder: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={onCreateFolder}
      >
        <FolderPlus className="size-4" /> New folder
      </Button>
    </div>
  );
}
