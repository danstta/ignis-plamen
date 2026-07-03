import type { FolderKind } from "@/lib/folders/types";

const DRAG_FORMAT = "application/x-ignis-folder-item";
const TEXT_PREFIX = "ignis-folder-item:";

export type FolderDragPayload = {
  kind: FolderKind;
  itemId: string;
};

export function setFolderDragPayload(
  event: React.DragEvent,
  payload: FolderDragPayload,
) {
  event.dataTransfer.effectAllowed = "move";
  const serialized = JSON.stringify(payload);
  event.dataTransfer.setData(DRAG_FORMAT, serialized);
  event.dataTransfer.setData("text/plain", `${TEXT_PREFIX}${serialized}`);
}

export function hasFolderDragPayload(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes(DRAG_FORMAT);
}

export function getFolderDragPayload(event: React.DragEvent) {
  const raw =
    event.dataTransfer.getData(DRAG_FORMAT) ||
    event.dataTransfer.getData("text/plain").replace(TEXT_PREFIX, "");
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
