import type { Asset } from "./types";

/**
 * Browser-side wrappers around the /api/assets endpoints. Shared by the Assets
 * library page and the editor's insert panel so request/parse/error handling lives
 * in one place. Each throws an Error with the server message on a non-2xx response.
 */

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body.error === "string") return body.error;
  return `${res.status} ${res.statusText}`;
}

export async function fetchAssets(signal?: AbortSignal): Promise<Asset[]> {
  const res = await fetch("/api/assets", { signal });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function uploadAssetFiles(files: File[]): Promise<Asset[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch("/api/assets", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function importSvgAsset(input: {
  name?: string;
  code: string;
}): Promise<Asset> {
  const res = await fetch("/api/assets/svg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function renameAsset(id: string, name: string): Promise<Asset> {
  const res = await fetch(`/api/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteAsset(id: string): Promise<void> {
  const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}
