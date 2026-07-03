"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FolderInput,
  FolderOpen,
  ImageIcon,
  ImageOff,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import {
  moveFolderItemAction,
  renameFolderAction,
  renameFolderItemAction,
  setFolderIconAction,
} from "@/app/(admin)/folders/actions";
import type { Asset } from "@/lib/assets/types";
import type { FolderItem, FolderKind, FolderSummary } from "@/lib/folders/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function FolderContextMenu({
  kind,
  folder,
  assets,
  children,
}: {
  kind: FolderKind;
  folder: FolderSummary;
  assets: Asset[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const rename = () => {
    const name = window.prompt("Rename folder", folder.name);
    if (name === null) return;
    startTransition(async () => {
      try {
        await renameFolderAction(kind, folder.id, name);
        router.refresh();
      } catch (err) {
        toast.error("Rename failed", { description: String(err) });
      }
    });
  };

  const setIcon = (assetId: string | null) => {
    startTransition(async () => {
      try {
        await setFolderIconAction(kind, folder.id, assetId);
        router.refresh();
      } catch (err) {
        toast.error("Icon not updated", { description: String(err) });
      }
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem onClick={rename} disabled={isPending}>
          <Pencil className="size-4" /> Rename
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ImageIcon className="size-4" /> Folder icon
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 min-w-56">
            <ContextMenuItem onClick={() => setIcon(null)} disabled={isPending}>
              <ImageOff className="size-4" /> No icon
            </ContextMenuItem>
            <ContextMenuSeparator />
            {assets.length === 0 ? (
              <ContextMenuItem disabled>No assets yet</ContextMenuItem>
            ) : (
              assets.map((asset) => (
                <ContextMenuItem
                  key={asset.id}
                  onClick={() => setIcon(asset.id)}
                  disabled={isPending}
                  className="min-w-0"
                >
                  <FolderAssetIcon asset={asset} />
                  <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                  {folder.iconUrl === asset.url ? <Check className="size-4" /> : null}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FolderItemContextMenu({
  kind,
  item,
  folders,
  children,
}: {
  kind: FolderKind;
  item: FolderItem;
  folders: FolderSummary[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const rename = () => {
    const name = window.prompt(
      kind === "design" ? "Rename design" : "Rename workflow",
      item.name,
    );
    if (name === null) return;
    startTransition(async () => {
      try {
        await renameFolderItemAction({ kind, itemId: item.id, name });
        router.refresh();
      } catch (err) {
        toast.error("Rename failed", { description: String(err) });
      }
    });
  };

  const move = (folderId: string | null) => {
    if (item.folderId === folderId) return;
    startTransition(async () => {
      try {
        await moveFolderItemAction({ kind, itemId: item.id, folderId });
        router.refresh();
      } catch (err) {
        toast.error("Move failed", { description: String(err) });
      }
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem onClick={rename} disabled={isPending}>
          <Pencil className="size-4" /> Rename
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="size-4" /> Move to folder
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 min-w-56">
            <ContextMenuLabel>Folders</ContextMenuLabel>
            <ContextMenuItem onClick={() => move(null)} disabled={isPending}>
              <FolderOpen className="size-4" /> No folder
              {item.folderId === null ? <Check className="ml-auto size-4" /> : null}
            </ContextMenuItem>
            <ContextMenuSeparator />
            {folders.length === 0 ? (
              <ContextMenuItem disabled>No folders yet</ContextMenuItem>
            ) : (
              folders.map((folder) => (
                <ContextMenuItem
                  key={folder.id}
                  onClick={() => move(folder.id)}
                  disabled={isPending}
                >
                  <FolderVisual folder={folder} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {item.folderId === folder.id ? (
                    <Check className="ml-auto size-4" />
                  ) : null}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FolderVisual({
  folder,
  className = "size-4",
}: {
  folder: Pick<FolderSummary, "name" | "iconUrl">;
  className?: string;
}) {
  if (!folder.iconUrl) return <FolderInput className={className} />;
  return (
    <span className={`${className} block overflow-hidden rounded-[4px] border bg-muted`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={folder.iconUrl}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    </span>
  );
}

function FolderAssetIcon({ asset }: { asset: Asset }) {
  return (
    <span className="block size-5 overflow-hidden rounded-[4px] border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.url}
        alt=""
        loading="lazy"
        className="size-full object-cover"
      />
    </span>
  );
}
