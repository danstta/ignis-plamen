import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { blobToken } from "@/lib/env";

export type StorageData = Buffer | Uint8Array | ArrayBuffer;

export interface StorageAdapter {
  /** Store bytes under `key`, returning a public URL. */
  put(key: string, data: StorageData, contentType: string): Promise<{ url: string }>;
}

function toBuffer(data: StorageData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  return Buffer.from(data);
}

/** Production adapter — Vercel Blob. */
class VercelBlobStorage implements StorageAdapter {
  async put(key: string, data: StorageData, contentType: string) {
    const blob = await put(key, toBuffer(data), {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: blobToken(),
    });
    return { url: blob.url };
  }
}

/** Dev fallback — writes to ./public/uploads, served at /uploads/<key>. */
class LocalStorage implements StorageAdapter {
  async put(key: string, data: StorageData, contentType: string) {
    void contentType;
    const filePath = path.join(process.cwd(), "public", "uploads", key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, toBuffer(data));
    return { url: `/uploads/${key.split(path.sep).join("/")}` };
  }
}

let _storage: StorageAdapter | null = null;

/** Vercel Blob when a token is present, otherwise local filesystem (dev only). */
export function storage(): StorageAdapter {
  if (_storage) return _storage;
  const token = blobToken();
  if (token) {
    _storage = new VercelBlobStorage();
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Add it to your Vercel environment variables."
    );
  } else {
    _storage = new LocalStorage();
  }
  return _storage;
}
