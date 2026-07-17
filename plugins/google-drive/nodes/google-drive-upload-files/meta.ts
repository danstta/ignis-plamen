import { z } from "zod";
import type { NodeMeta } from "@/lib/nodes/types";

export const GOOGLE_DRIVE_UPLOAD_FILES_TYPE_ID = "google-drive-upload-files";

export const googleDriveUploadFilesConfigSchema = z.object({
  connectionId: z.string().default(""),
  folder: z.string().default(""),
  files: z.unknown().default(""),
  fileName: z.string().default(""),
});

export type GoogleDriveUploadFilesConfig = z.infer<
  typeof googleDriveUploadFilesConfigSchema
>;

export const googleDriveUploadFilesMeta: NodeMeta<GoogleDriveUploadFilesConfig> = {
  id: GOOGLE_DRIVE_UPLOAD_FILES_TYPE_ID,
  label: "Upload Drive Files",
  description:
    "Uploads one or more files to a Google Drive folder from file URLs or upstream outputs.",
  category: "output",
  group: "google-drive",
  inputs: [{ id: "files", label: "Files", kind: "data" }],
  outputs: [
    { id: "files", label: "Uploaded files", kind: "data" },
    { id: "ids", label: "File IDs", kind: "data" },
    { id: "links", label: "Drive links", kind: "data" },
    { id: "firstFileId", label: "First file ID", kind: "text" },
    { id: "firstLink", label: "First Drive link", kind: "text" },
    { id: "count", label: "Count", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Google Drive connection",
      type: "connection",
      connectionTypes: ["google-drive"],
      help: "Choose the Drive account that can write to this folder.",
    },
    {
      name: "folder",
      label: "Folder link or ID",
      type: "text",
      placeholder: "https://drive.google.com/drive/folders/... or folder ID",
      help: "Paste a Google Drive folder URL or the folder ID itself.",
    },
    {
      name: "files",
      label: "File URL(s)",
      type: "textarea",
      placeholder: "{{...}} or one URL per line",
      help: "Optional when the Files input is connected. Accepts a URL, an array of URLs, or objects with url/renderUrl fields.",
    },
    {
      name: "fileName",
      label: "File name",
      type: "text",
      placeholder: "Optional, e.g. design-{index}.png",
      help: "Optional. Use {index} for multiple files, or leave blank to derive names from source URLs.",
    },
  ],
  configSchema: googleDriveUploadFilesConfigSchema,
};
