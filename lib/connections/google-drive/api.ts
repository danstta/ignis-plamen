import { ensureFreshToken } from "@/lib/connections/oauth";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export interface GoogleDriveImageFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  webViewLink: string;
  webContentLink?: string;
  thumbnailLink?: string;
  directLink: string;
  widthPx?: number;
  heightPx?: number;
}

export interface GoogleDriveUploadedFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink?: string;
}

interface DriveFileResponse {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
  };
}

interface DriveErrorResponse {
  error?: {
    message?: string;
  };
}

interface DriveListResponse {
  nextPageToken?: string;
  files?: DriveFileResponse[];
  error?: {
    message?: string;
  };
}

function driveViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function driveDirectLink(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function multipartRelatedBody(input: {
  metadata: Record<string, unknown>;
  bytes: Uint8Array;
  mimeType: string;
}): { body: Blob; contentType: string } {
  const boundary = `ignis-${crypto.randomUUID()}`;
  const contentType = `multipart/related; boundary=${boundary}`;
  const metadata = JSON.stringify(input.metadata);
  const bytes = Uint8Array.from(input.bytes);
  const body = new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      metadata,
      "\r\n",
      `--${boundary}\r\n`,
      `Content-Type: ${input.mimeType}\r\n\r\n`,
      bytes.buffer,
      "\r\n",
      `--${boundary}--\r\n`,
    ],
    { type: contentType },
  );

  return { body, contentType };
}

export function parseGoogleDriveFolderId(input: string): string {
  const value = input.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const folderMatch = url.pathname.match(/\/folders\/([^/?#]+)/);
    if (folderMatch?.[1]) return decodeURIComponent(folderMatch[1]);

    const id = url.searchParams.get("id");
    if (id) return id.trim();
  } catch {
    // Treat plain input as the folder ID.
  }

  return value;
}

function toImageFile(file: DriveFileResponse): GoogleDriveImageFile | undefined {
  if (!file.id || !file.mimeType?.startsWith("image/")) return undefined;
  return {
    id: file.id,
    name: file.name ?? file.id,
    mimeType: file.mimeType,
    url: driveDirectLink(file.id),
    webViewLink: file.webViewLink ?? driveViewLink(file.id),
    webContentLink: file.webContentLink,
    thumbnailLink: file.thumbnailLink,
    directLink: driveDirectLink(file.id),
    widthPx: file.imageMediaMetadata?.width,
    heightPx: file.imageMediaMetadata?.height,
  };
}

export async function listGoogleDriveFolderImages(input: {
  connectionId: string;
  folder: string;
  maxImages: number;
}): Promise<GoogleDriveImageFile[]> {
  const folderId = parseGoogleDriveFolderId(input.folder);
  if (!folderId) throw new Error("Google Drive folder link or ID is required");

  const token = await ensureFreshToken(input.connectionId);
  const maxImages = Math.max(1, Math.trunc(input.maxImages));
  const q = [
    `'${escapeDriveQueryValue(folderId)}' in parents`,
    "trashed = false",
    "mimeType != '" + DRIVE_FOLDER_MIME + "'",
    "mimeType contains 'image/'",
  ].join(" and ");

  const images: GoogleDriveImageFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("pageSize", String(Math.min(1000, maxImages - images.length)));
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set(
      "fields",
      [
        "nextPageToken",
        "files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink,imageMediaMetadata(width,height))",
      ].join(","),
    );
    url.searchParams.set("orderBy", "name_natural");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await res.json().catch(() => null)) as DriveListResponse | null;
    if (!res.ok) {
      throw new Error(
        `Google Drive list failed (${res.status}): ${
          body?.error?.message ?? res.statusText
        }`,
      );
    }

    for (const file of body?.files ?? []) {
      const image = toImageFile(file);
      if (!image) continue;
      images.push(image);
      if (images.length >= maxImages) break;
    }

    pageToken = images.length < maxImages ? body?.nextPageToken : undefined;
  } while (pageToken);

  return images;
}

export async function uploadGoogleDriveFile(input: {
  connectionId: string;
  folder: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<GoogleDriveUploadedFile> {
  const folderId = parseGoogleDriveFolderId(input.folder);
  if (!folderId) throw new Error("Google Drive folder link or ID is required");

  const token = await ensureFreshToken(input.connectionId);
  const url = new URL(DRIVE_UPLOAD_URL);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set(
    "fields",
    "id,name,mimeType,webViewLink,webContentLink",
  );

  const { body, contentType } = multipartRelatedBody({
    metadata: {
      name: input.name,
      parents: [folderId],
    },
    bytes: input.bytes,
    mimeType: input.mimeType,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body,
  });
  const responseBody = (await res.json().catch(() => null)) as
    | (DriveFileResponse & DriveErrorResponse)
    | null;

  if (!res.ok) {
    throw new Error(
      `Google Drive upload failed (${res.status}): ${
        responseBody?.error?.message ?? res.statusText
      }`,
    );
  }

  if (!responseBody?.id) {
    throw new Error("Google Drive upload response did not include a file ID");
  }

  return {
    id: responseBody.id,
    name: responseBody.name ?? input.name,
    mimeType: responseBody.mimeType ?? input.mimeType,
    webViewLink: responseBody.webViewLink ?? driveViewLink(responseBody.id),
    webContentLink: responseBody.webContentLink,
  };
}
