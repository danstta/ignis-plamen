"use server";

import { revalidatePath } from "next/cache";
import {
  createFolder,
  moveTemplateToFolder,
  moveWorkflowToFolder,
} from "@/lib/folders/service";
import type { FolderKind } from "@/lib/folders/types";

function revalidateFolderSurfaces(kind: FolderKind) {
  revalidatePath("/", "layout");
  revalidatePath(kind === "design" ? "/templates" : "/workflows");
}

export async function createFolderAction(kind: FolderKind, name: string) {
  const folder = await createFolder({ kind, name });
  revalidateFolderSurfaces(kind);
  return { id: folder.id, kind: folder.kind, name: folder.name };
}

export async function moveFolderItemAction({
  kind,
  itemId,
  folderId,
}: {
  kind: FolderKind;
  itemId: string;
  folderId: string | null;
}) {
  if (kind === "design") {
    await moveTemplateToFolder(itemId, folderId);
  } else {
    await moveWorkflowToFolder(itemId, folderId);
  }
  revalidateFolderSurfaces(kind);
}
