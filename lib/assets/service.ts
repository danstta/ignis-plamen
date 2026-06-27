import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, type Asset as AssetRow } from "@/lib/db/schema";
import { assetStorage } from "@/lib/storage";
import { extensionForType, SVG_CONTENT_TYPE } from "./constants";
import type { Asset } from "./types";

function toDto(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    contentType: row.contentType,
    bytes: row.bytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Curated library assets (kind "upload"), newest first. */
export async function listAssets(): Promise<Asset[]> {
  const rows = await db()
    .select()
    .from(assets)
    .where(eq(assets.kind, "upload"))
    .orderBy(desc(assets.createdAt));
  return rows.map(toDto);
}

/**
 * Store raw bytes in the asset backend and record the row. The single funnel that
 * both file uploads and SVG-code imports go through, so storage + DB stay in sync.
 */
export async function createAssetFromBytes(input: {
  name: string;
  contentType: string;
  data: Buffer | Uint8Array;
}): Promise<Asset> {
  const ext = extensionForType(input.contentType);
  const storageKey = `assets/${crypto.randomUUID()}.${ext}`;
  const { url } = await assetStorage().put(storageKey, input.data, input.contentType);

  const rows = await db()
    .insert(assets)
    .values({
      kind: "upload",
      name: input.name,
      url,
      storageKey,
      contentType: input.contentType,
      bytes: input.data.byteLength,
    })
    .returning();
  return toDto(rows[0]);
}

/** Import pasted SVG markup as a stored .svg asset. */
export async function importSvgAsset(input: {
  name?: string;
  code: string;
}): Promise<Asset> {
  const data = Buffer.from(input.code.trim(), "utf8");
  const name = input.name?.trim() || "Untitled SVG";
  return createAssetFromBytes({ name, contentType: SVG_CONTENT_TYPE, data });
}

/** Delete an asset row and its underlying stored file (best-effort on the file). */
export async function deleteAsset(id: string): Promise<boolean> {
  const rows = await db().select().from(assets).where(eq(assets.id, id)).limit(1);
  const row = rows[0];
  if (!row) return false;

  if (row.storageKey) {
    const store = assetStorage();
    try {
      await store.remove?.(row.storageKey);
    } catch (err) {
      // Don't block row deletion on a storage hiccup; log and proceed so the UI
      // doesn't strand a row pointing at a file we couldn't reach.
      console.error(`[assets] failed to remove ${row.storageKey}:`, err);
    }
  }

  await db().delete(assets).where(eq(assets.id, id));
  return true;
}

/** Rename an asset. Returns the updated DTO, or null if it doesn't exist. */
export async function renameAsset(id: string, name: string): Promise<Asset | null> {
  const rows = await db()
    .update(assets)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning();
  return rows[0] ? toDto(rows[0]) : null;
}
