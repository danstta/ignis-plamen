import { getConnection } from "@/lib/connections/service";
import {
  parseGoogleDriveFolderId,
  uploadGoogleDriveFile,
  type GoogleDriveUploadedFile,
} from "@/lib/connections/google-drive/api";
import type { NodeDefinition } from "@/lib/nodes/types";
import {
  googleDriveUploadFilesMeta,
  type GoogleDriveUploadFilesConfig,
} from "./meta";

const MAX_BYTES = 50 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "text/csv": "csv",
  "text/plain": "txt",
};

type UploadSource = {
  url: string;
  name?: string;
  mimeType?: string;
};

type DownloadedFile = {
  bytes: Uint8Array;
  mimeType: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function splitSourceString(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return collectUploadSources(JSON.parse(trimmed)).map((source) => source.url);
    } catch {
      // Treat invalid JSON as plain URL text.
    }
  }

  if (trimmed.startsWith("data:")) return [trimmed];

  const lines = trimmed
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const commaParts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return commaParts.length > 1 ? commaParts : [trimmed];
}

function collectUploadSources(value: unknown): UploadSource[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUploadSources(item));
  }

  if (typeof value === "string") {
    return splitSourceString(value).map((url) => ({ url }));
  }

  if (!isRecord(value)) return [];

  const nestedKeys = [
    "files",
    "renderUrls",
    "urls",
    "links",
    "directLinks",
    "images",
    "designs",
    "candidates",
    "ranked",
  ];
  for (const key of nestedKeys) {
    if (Array.isArray(value[key])) return collectUploadSources(value[key]);
  }

  const url =
    nonEmptyString(value.url) ??
    nonEmptyString(value.renderUrl) ??
    nonEmptyString(value.webContentLink) ??
    nonEmptyString(value.directLink) ??
    nonEmptyString(value.webViewLink) ??
    nonEmptyString(value.firstDirectLink) ??
    nonEmptyString(value.firstLink) ??
    nonEmptyString(value.chosen) ??
    nonEmptyString(value.sourceImageUrl);
  if (!url) return [];

  return [
    {
      url,
      name:
        nonEmptyString(value.name) ??
        nonEmptyString(value.fileName) ??
        nonEmptyString(value.title),
      mimeType: nonEmptyString(value.mimeType),
    },
  ];
}

function uniqueSources(sources: UploadSource[]): UploadSource[] {
  const seen = new Set<string>();
  const unique: UploadSource[] = [];
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    unique.push(source);
  }
  return unique;
}

function extensionFor(mimeType: string, url?: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (EXT_BY_TYPE[normalized]) return EXT_BY_TYPE[normalized];
  if (url) {
    try {
      const match = new URL(url).pathname.match(/\.([a-z0-9]{2,8})$/i);
      if (match?.[1]) return match[1].toLowerCase();
    } catch {
      // Fall through to default extension.
    }
  }
  return "bin";
}

function sanitizeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "upload";
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

function withExtension(name: string, mimeType: string, url: string): string {
  if (/\.[a-z0-9]{2,8}$/i.test(name)) return name;
  return `${name}.${extensionFor(mimeType, url)}`;
}

function indexedName(name: string, index: number): string {
  const match = name.match(/^(.*?)(\.[a-z0-9]{2,8})$/i);
  if (!match) return `${name}-${index + 1}`;
  return `${match[1]}-${index + 1}${match[2]}`;
}

function uploadName(input: {
  source: UploadSource;
  downloaded: DownloadedFile;
  override: string;
  index: number;
  total: number;
}): string {
  const override = input.override.trim();
  if (override) {
    const templated = override.replaceAll("{index}", String(input.index + 1));
    const name =
      input.total === 1 || override.includes("{index}")
        ? templated
        : indexedName(templated, input.index);
    return sanitizeFileName(
      withExtension(name, input.downloaded.mimeType, input.source.url),
    );
  }

  const derived =
    input.source.name ??
    fileNameFromUrl(input.source.url) ??
    `drive-upload-${input.index + 1}`;
  return sanitizeFileName(
    withExtension(derived, input.downloaded.mimeType, input.source.url),
  );
}

function readDataUrl(url: string): DownloadedFile {
  const match = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Invalid data URL");

  const mimeType = match[1] || "application/octet-stream";
  const data = match[3] ?? "";
  const bytes = match[2]
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data));
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`File too large: ${bytes.byteLength} bytes (max ${MAX_BYTES})`);
  }
  return { bytes, mimeType };
}

async function downloadSource(source: UploadSource): Promise<DownloadedFile> {
  if (source.url.startsWith("data:")) return readDataUrl(source.url);
  if (!/^https?:\/\//i.test(source.url)) {
    throw new Error(`Unsupported file URL scheme: ${source.url.slice(0, 60)}`);
  }

  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status} ${res.statusText})`);
  }

  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error(`File too large: ${declared} bytes (max ${MAX_BYTES})`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`File too large: ${bytes.byteLength} bytes (max ${MAX_BYTES})`);
  }

  return {
    bytes,
    mimeType:
      source.mimeType ??
      res.headers.get("content-type") ??
      "application/octet-stream",
  };
}

export const googleDriveUploadFilesNode: NodeDefinition<GoogleDriveUploadFilesConfig> = {
  ...googleDriveUploadFilesMeta,

  async run(ctx) {
    const connection = await getConnection(ctx.config.connectionId);
    if (!connection || connection.type !== "google-drive") {
      throw new Error("Select a valid Google Drive connection");
    }

    const folderId = parseGoogleDriveFolderId(ctx.config.folder);
    if (!folderId) throw new Error("Google Drive folder link or ID is required");

    const sources = uniqueSources([
      ...collectUploadSources(ctx.inputs.files),
      ...collectUploadSources(ctx.config.files),
    ]);
    if (sources.length === 0) {
      throw new Error("Add a file URL or connect the Files input");
    }

    const uploaded: GoogleDriveUploadedFile[] = [];
    for (const [index, source] of sources.entries()) {
      const downloaded = await downloadSource(source);
      const name = uploadName({
        source,
        downloaded,
        override: ctx.config.fileName,
        index,
        total: sources.length,
      });

      ctx.log(`uploading ${name} to Drive folder ${folderId}`);
      uploaded.push(
        await uploadGoogleDriveFile({
          connectionId: ctx.config.connectionId,
          folder: folderId,
          name,
          mimeType: downloaded.mimeType,
          bytes: downloaded.bytes,
        }),
      );
    }

    ctx.log(`uploaded ${uploaded.length} file(s) to Drive folder ${folderId}`);

    return {
      type: "output",
      outputs: {
        folderId,
        count: uploaded.length,
        ids: uploaded.map((file) => file.id),
        links: uploaded.map((file) => file.webViewLink),
        firstFileId: uploaded[0]?.id ?? "",
        firstLink: uploaded[0]?.webViewLink ?? "",
        files: uploaded,
      },
    };
  },
};
