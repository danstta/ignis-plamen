import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  supabaseAssetsBucket,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/env";
import type { StorageAdapter, StorageData } from "./index";

function toBuffer(data: StorageData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  return Buffer.from(data);
}

/**
 * Supabase Storage adapter for the Assets library. Uses the service-role key, so
 * it must only ever run server-side (API routes / server actions). The bucket is
 * created on first use as a public bucket so uploaded files get stable public URLs
 * (mirroring Vercel Blob's `access: "public"`).
 */
export class SupabaseStorage implements StorageAdapter {
  private _client: SupabaseClient | null = null;
  private _bucketReady: Promise<void> | null = null;

  private client(): SupabaseClient {
    if (this._client) return this._client;
    const url = supabaseUrl();
    const key = supabaseServiceRoleKey();
    if (!url || !key) {
      throw new Error(
        "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    // Service-role client: no session persistence, no token refresh — it's a
    // stateless server credential.
    this._client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this._client;
  }

  /** Create the public bucket if it doesn't exist yet (memoized per process). */
  private ensureBucket(): Promise<void> {
    if (this._bucketReady) return this._bucketReady;
    const bucket = supabaseAssetsBucket();
    this._bucketReady = (async () => {
      const client = this.client();
      const { data, error } = await client.storage.getBucket(bucket);
      if (data) return;
      // getBucket errors when the bucket is missing; try to create it. Treat an
      // "already exists" race as success.
      const { error: createError } = await client.storage.createBucket(bucket, {
        public: true,
      });
      if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(
          `Failed to ensure Supabase bucket "${bucket}": ${createError.message}` +
            (error ? ` (lookup: ${error.message})` : ""),
        );
      }
    })().catch((err) => {
      // Don't cache a failed attempt — let the next call retry.
      this._bucketReady = null;
      throw err;
    });
    return this._bucketReady;
  }

  async put(key: string, data: StorageData, contentType: string) {
    await this.ensureBucket();
    const bucket = supabaseAssetsBucket();
    const client = this.client();
    const { error } = await client.storage
      .from(bucket)
      .upload(key, toBuffer(data), { contentType, upsert: true });
    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }
    const { data: pub } = client.storage.from(bucket).getPublicUrl(key);
    return { url: pub.publicUrl };
  }

  async remove(key: string) {
    const bucket = supabaseAssetsBucket();
    const { error } = await this.client().storage.from(bucket).remove([key]);
    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }
}
