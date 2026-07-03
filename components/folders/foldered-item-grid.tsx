"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, FolderPlus } from "lucide-react";
import { toast } from "sonner";

import {
  createFolderAction,
  moveFolderItemAction,
} from "@/app/(admin)/folders/actions";
import { Button } from "@/components/ui/button";
import {
  getFolderDragPayload,
  setFolderDragPayload,
} from "@/components/folders/drag-data";
import { cn } from "@/lib/utils";
import type { FolderItem, FolderKind, FolderSummary } from "@/lib/folders/types";

export function FolderedItemGrid<TItem extends FolderItem>({
  kind,
  folders,
  items,
  emptyLabel,
  gridClassName,
  renderItem,
}: {
  kind: FolderKind;
  folders: FolderSummary[];
  items: TItem[];
  emptyLabel: string;
  gridClassName: string;
  renderItem: (item: TItem) => React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

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
    title,
    items: sectionItems,
    unfiled,
  }: {
    id: string;
    folderId: string | null;
    title: string;
    items: TItem[];
    unfiled?: boolean;
  }) => (
    <section
      key={id}
      onDragOver={(event) => {
        const payload = getFolderDragPayload(event);
        if (payload?.kind !== kind) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(event) => {
        const payload = getFolderDragPayload(event);
        if (payload?.kind === kind) setDropTarget(id);
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(event) => {
        const payload = getFolderDragPayload(event);
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
      <div className="mb-3 flex items-center gap-2">
        {unfiled ? (
          <FolderOpen className="size-4 text-muted-foreground" />
        ) : (
          <Folder className="size-4 text-muted-foreground" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {sectionItems.length}
        </span>
      </div>

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
              onDragStart={(event) =>
                setFolderDragPayload(event, { kind, itemId: item.id })
              }
              className="cursor-grab active:cursor-grabbing"
            >
              {renderItem(item)}
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
            title: folder.name,
            items: itemsByFolder.get(folder.id) ?? [],
          }),
        )}
        {renderSection({
          id: "unfiled",
          folderId: null,
          title: folders.length > 0 ? "Unfiled" : "All items",
          items: unfiled,
          unfiled: true,
        })}
      </div>
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
