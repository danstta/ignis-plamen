import { createHmac, timingSafeEqual } from "crypto";
import { ensureFreshToken } from "@/lib/connections/oauth";
import { publicAppUrl, sessionSecret } from "@/lib/env";

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
  /** The folder the file itself sits in, not the root of the walked tree. */
  folderId: string;
  folderName: string;
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

function googleDriveImageSignature(connectionId: string, fileId: string): string {
  return createHmac("sha256", sessionSecret())
    .update(`${connectionId}:${fileId}`)
    .digest("base64url");
}

function proxyBaseUrl(): string {
  return (
    publicAppUrl() ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000")
  );
}

export function verifyGoogleDriveImageSignature(input: {
  connectionId: string;
  fileId: string;
  signature: string;
}): boolean {
  const expected = Buffer.from(
    googleDriveImageSignature(input.connectionId, input.fileId),
  );
  const actual = Buffer.from(input.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signedGoogleDriveImageUrl(input: {
  connectionId: string;
  fileId: string;
}): string {
  const path = `/api/drive-images/${encodeURIComponent(input.fileId)}`;
  const params = new URLSearchParams({
    connectionId: input.connectionId,
    sig: googleDriveImageSignature(input.connectionId, input.fileId),
  });
  return `${proxyBaseUrl()}${path}?${params.toString()}`;
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

function toImageFile(
  file: DriveFileResponse,
  connectionId: string,
  folder: DriveFolder,
): GoogleDriveImageFile | undefined {
  if (!file.id || !file.mimeType?.startsWith("image/")) return undefined;
  return {
    id: file.id,
    name: file.name ?? file.id,
    mimeType: file.mimeType,
    url: signedGoogleDriveImageUrl({ connectionId, fileId: file.id }),
    webViewLink: file.webViewLink ?? driveViewLink(file.id),
    webContentLink: file.webContentLink,
    thumbnailLink: file.thumbnailLink,
    directLink: driveDirectLink(file.id),
    widthPx: file.imageMediaMetadata?.width,
    heightPx: file.imageMediaMetadata?.height,
    folderId: folder.id,
    folderName: folder.name,
  };
}

function isDriveFolder(file: DriveFileResponse): file is DriveFileResponse & { id: string } {
  return file.mimeType === DRIVE_FOLDER_MIME && Boolean(file.id);
}

/** A folder in the walked tree, carried so each image can name its own parent. */
interface DriveFolder {
  id: string;
  name: string;
}

async function listGoogleDriveFolderChildren(input: {
  connectionId: string;
  token: string;
  folder: DriveFolder;
  maxImages: number;
  images: GoogleDriveImageFile[];
}): Promise<DriveFolder[]> {
  const q = [
    `'${escapeDriveQueryValue(input.folder.id)}' in parents`,
    "trashed = false",
    `(mimeType = '${DRIVE_FOLDER_MIME}' or mimeType contains 'image/')`,
  ].join(" and ");

  const childFolders: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("pageSize", "1000");
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
        Authorization: `Bearer ${input.token}`,
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
      if (isDriveFolder(file)) {
        childFolders.push({ id: file.id, name: file.name ?? file.id });
        continue;
      }

      const image = toImageFile(file, input.connectionId, input.folder);
      if (!image) continue;
      input.images.push(image);
      if (input.images.length >= input.maxImages) break;
    }

    pageToken = input.images.length < input.maxImages ? body?.nextPageToken : undefined;
  } while (pageToken);

  return childFolders;
}

/**
 * Names the folder the walk starts from. Child folder names arrive with the
 * listing, but the root's only reaches us as an id, so it costs one lookup.
 */
async function fetchDriveFolderName(input: {
  token: string;
  folderId: string;
}): Promise<string> {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(input.folderId)}`);
  url.searchParams.set("fields", "name");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.token}`,
    },
  });
  if (!res.ok) return input.folderId;

  const body = (await res.json().catch(() => null)) as DriveFileResponse | null;
  return body?.name ?? input.folderId;
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
  const images: GoogleDriveImageFile[] = [];
  const folderQueue: DriveFolder[] = [
    { id: folderId, name: await fetchDriveFolderName({ token, folderId }) },
  ];
  const visitedFolderIds = new Set<string>();
  let folderIndex = 0;

  while (folderIndex < folderQueue.length && images.length < maxImages) {
    const currentFolder = folderQueue[folderIndex++];
    if (!currentFolder || visitedFolderIds.has(currentFolder.id)) continue;
    visitedFolderIds.add(currentFolder.id);

    const childFolders = await listGoogleDriveFolderChildren({
      token,
      connectionId: input.connectionId,
      folder: currentFolder,
      maxImages,
      images,
    });

    for (const childFolder of childFolders) {
      if (!visitedFolderIds.has(childFolder.id)) folderQueue.push(childFolder);
    }
  }

  return images;
}

export async function fetchGoogleDriveImageFile(input: {
  connectionId: string;
  fileId: string;
}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const token = await ensureFreshToken(input.connectionId);
  const url = new URL(
    `${DRIVE_FILES_URL}/${encodeURIComponent(input.fileId)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`Google Drive image fetch failed (${res.status}): ${message}`);
  }

  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
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

export interface GoogleDriveFolder {
  id: string;
  name: string;
  webViewLink: string;
  /** True when the folder was found by name instead of being created by this call. */
  reused: boolean;
}

/** Link-sharing role granted to "anyone with the link". `private` skips sharing. */
export type GoogleDriveLinkAccess = "private" | "reader" | "commenter" | "writer";

export function googleDriveFolderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/** Finds a non-trashed folder by exact name inside a parent, if one exists. */
async function findGoogleDriveFolderByName(input: {
  token: string;
  parentId: string;
  name: string;
}): Promise<DriveFileResponse | undefined> {
  const q = [
    `'${escapeDriveQueryValue(input.parentId)}' in parents`,
    `name = '${escapeDriveQueryValue(input.name)}'`,
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");

  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("fields", "files(id,name,webViewLink)");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.token}`,
    },
  });
  const body = (await res.json().catch(() => null)) as DriveListResponse | null;
  if (!res.ok) {
    throw new Error(
      `Google Drive folder lookup failed (${res.status}): ${
        body?.error?.message ?? res.statusText
      }`,
    );
  }

  return body?.files?.[0];
}

/**
 * Creates a folder inside `parent`. With `reuseExisting`, an existing folder of
 * the same name is returned instead of a duplicate being created.
 */
export async function createGoogleDriveFolder(input: {
  connectionId: string;
  parent: string;
  name: string;
  reuseExisting: boolean;
}): Promise<GoogleDriveFolder> {
  const parentId = parseGoogleDriveFolderId(input.parent);
  if (!parentId) throw new Error("Google Drive parent folder link or ID is required");

  const name = input.name.trim();
  if (!name) throw new Error("Folder name is required");

  const token = await ensureFreshToken(input.connectionId);

  if (input.reuseExisting) {
    const existing = await findGoogleDriveFolderByName({ token, parentId, name });
    if (existing?.id) {
      return {
        id: existing.id,
        name: existing.name ?? name,
        webViewLink: existing.webViewLink ?? googleDriveFolderLink(existing.id),
        reused: true,
      };
    }
  }

  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,webViewLink");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [parentId],
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | (DriveFileResponse & DriveErrorResponse)
    | null;

  if (!res.ok) {
    throw new Error(
      `Google Drive folder create failed (${res.status}): ${
        body?.error?.message ?? res.statusText
      }`,
    );
  }

  if (!body?.id) {
    throw new Error("Google Drive folder create response did not include an ID");
  }

  return {
    id: body.id,
    name: body.name ?? name,
    webViewLink: body.webViewLink ?? googleDriveFolderLink(body.id),
    reused: false,
  };
}

/** A permission entry as returned by Drive's permissions.list. */
interface DrivePermission {
  id?: string;
  type?: string;
  role?: string;
}

interface DrivePermissionListResponse {
  permissions?: DrivePermission[];
  error?: { message?: string };
}

async function findAnyonePermission(input: {
  token: string;
  fileId: string;
}): Promise<DrivePermission | undefined> {
  const url = new URL(
    `${DRIVE_FILES_URL}/${encodeURIComponent(input.fileId)}/permissions`,
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "permissions(id,type,role)");
  url.searchParams.set("pageSize", "100");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.token}`,
    },
  });
  const body = (await res.json().catch(() => null)) as
    | DrivePermissionListResponse
    | null;
  if (!res.ok) {
    throw new Error(
      `Google Drive permission list failed (${res.status}): ${
        body?.error?.message ?? res.statusText
      }`,
    );
  }

  return body?.permissions?.find((permission) => permission.type === "anyone");
}

async function writeAnyonePermission(input: {
  token: string;
  fileId: string;
  role: Exclude<GoogleDriveLinkAccess, "private">;
  existingId?: string;
}): Promise<void> {
  const base = `${DRIVE_FILES_URL}/${encodeURIComponent(input.fileId)}/permissions`;
  const url = new URL(
    input.existingId ? `${base}/${encodeURIComponent(input.existingId)}` : base,
  );
  url.searchParams.set("supportsAllDrives", "true");
  if (!input.existingId) url.searchParams.set("sendNotificationEmail", "false");

  const res = await fetch(url, {
    method: input.existingId ? "PATCH" : "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      input.existingId
        ? { role: input.role }
        : { type: "anyone", role: input.role },
    ),
  });
  if (res.ok) return;

  const body = (await res.json().catch(() => null)) as DriveErrorResponse | null;
  throw new Error(
    `Google Drive share failed (${res.status}): ${
      body?.error?.message ?? res.statusText
    }`,
  );
}

/**
 * Grants "anyone with the link" the given role on a file or folder. Drive keeps
 * at most one anyone-permission per item, so an existing one is patched instead
 * of a second being created. A `private` access is a no-op.
 */
export async function setGoogleDriveLinkAccess(input: {
  connectionId: string;
  fileId: string;
  access: GoogleDriveLinkAccess;
}): Promise<void> {
  if (input.access === "private") return;

  const token = await ensureFreshToken(input.connectionId);
  const existing = await findAnyonePermission({ token, fileId: input.fileId });
  if (existing?.role === input.access) return;

  await writeAnyonePermission({
    token,
    fileId: input.fileId,
    role: input.access,
    existingId: existing?.id,
  });
}
