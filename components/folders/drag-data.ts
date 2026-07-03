import type { FolderKind } from "@/lib/folders/types";

const DRAG_FORMAT = "application/x-ignis-folder-item";

export type FolderDragPayload = {
  kind: FolderKind;
  itemId: string;
};

export function setFolderDragPayload(
  event: React.DragEvent,
  payload: FolderDragPayload,
) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_FORMAT, JSON.stringify(payload));
}

export function getFolderDragPayload(event: React.DragEvent) {
  const raw = event.dataTransfer.getData(DRAG_FORMAT);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Partial<FolderDragPayload>;
    if (
      (payload.kind === "design" || payload.kind === "workflow") &&
      typeof payload.itemId === "string"
    ) {
      return payload as FolderDragPayload;
    }
  } catch {}
  return null;
}
