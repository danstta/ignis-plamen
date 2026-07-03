"use server";

import { revalidatePath } from "next/cache";
import {
  createFolder,
  moveTemplateToFolder,
  moveWorkflowToFolder,
  renameFolder,
  renameTemplate,
  renameWorkflow,
  setFolderIcon,
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

export async function renameFolderAction(kind: FolderKind, id: string, name: string) {
  await renameFolder(id, name);
  revalidateFolderSurfaces(kind);
}

export async function setFolderIconAction(
  kind: FolderKind,
  id: string,
  assetId: string | null,
) {
  await setFolderIcon(id, assetId);
  revalidateFolderSurfaces(kind);
}

export async function renameFolderItemAction({
  kind,
  itemId,
  name,
}: {
  kind: FolderKind;
  itemId: string;
  name: string;
}) {
  if (kind === "design") {
    await renameTemplate(itemId, name);
  } else {
    await renameWorkflow(itemId, name);
  }
  revalidateFolderSurfaces(kind);
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
