import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { folders, templates, workflows } from "@/lib/db/schema";
import type { FolderKind } from "@/lib/folders/types";

export type FolderInput = {
  kind: FolderKind;
  name: string;
};

function normalizeFolderName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Folder name is required");
  if (normalized.length > 80) throw new Error("Folder name is too long");
  return normalized;
}

export async function listFolders(kind: FolderKind) {
  return db()
    .select({
      id: folders.id,
      kind: folders.kind,
      name: folders.name,
      updatedAt: folders.updatedAt,
    })
    .from(folders)
    .where(eq(folders.kind, kind))
    .orderBy(asc(folders.name));
}

export async function createFolder(input: FolderInput) {
  const rows = await db()
    .insert(folders)
    .values({ kind: input.kind, name: normalizeFolderName(input.name) })
    .returning();
  return rows[0];
}

async function assertFolderKind(folderId: string | null, kind: FolderKind) {
  if (!folderId) return;
  const rows = await db()
    .select({ id: folders.id, kind: folders.kind })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  const folder = rows[0];
  if (!folder) throw new Error("Folder not found");
  if (folder.kind !== kind) {
    throw new Error("Folder cannot contain this item type");
  }
}

export async function moveTemplateToFolder(id: string, folderId: string | null) {
  await assertFolderKind(folderId, "design");
  const rows = await db()
    .update(templates)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(templates.id, id))
    .returning({ id: templates.id });
  if (!rows[0]) throw new Error("Design not found");
}

export async function moveWorkflowToFolder(id: string, folderId: string | null) {
  await assertFolderKind(folderId, "workflow");
  const rows = await db()
    .update(workflows)
    .set({ folderId, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning({ id: workflows.id });
  if (!rows[0]) throw new Error("Workflow not found");
}
