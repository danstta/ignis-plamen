import { z } from "zod";
import type { NodeMeta } from "@/lib/nodes/types";

export const GOOGLE_DRIVE_CREATE_FOLDER_TYPE_ID = "google-drive-create-folder";

/** Mirrors GoogleDriveLinkAccess in lib/connections/google-drive/api.ts. */
export const googleDriveLinkAccessValues = [
  "private",
  "reader",
  "commenter",
  "writer",
] as const;

export const googleDriveCreateFolderConfigSchema = z.object({
  connectionId: z.string().default(""),
  parentFolder: z.string().default(""),
  folderName: z.string().default(""),
  linkAccess: z.enum(googleDriveLinkAccessValues).default("private"),
  reuseExisting: z.boolean().default(true),
});

export type GoogleDriveCreateFolderConfig = z.infer<
  typeof googleDriveCreateFolderConfigSchema
>;

export const googleDriveCreateFolderMeta: NodeMeta<GoogleDriveCreateFolderConfig> = {
  id: GOOGLE_DRIVE_CREATE_FOLDER_TYPE_ID,
  label: "Create Drive Folder",
  description:
    "Creates a folder inside a Google Drive folder and returns its shareable link.",
  category: "output",
  group: "google-drive",
  inputs: [{ id: "folderName", label: "Folder name", kind: "text" }],
  outputs: [
    { id: "folderId", label: "Folder ID", kind: "text" },
    { id: "folderUrl", label: "Folder link", kind: "text" },
    { id: "folderName", label: "Folder name", kind: "text" },
    { id: "linkAccess", label: "Link access", kind: "text" },
    { id: "reused", label: "Reused existing", kind: "data" },
    { id: "folder", label: "Folder", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Google Drive connection",
      type: "connection",
      connectionTypes: ["google-drive"],
      help: "Choose the Drive account that can write to the parent folder.",
    },
    {
      name: "parentFolder",
      label: "Parent folder link or ID",
      type: "text",
      placeholder: "https://drive.google.com/drive/folders/... or folder ID",
      help: "The folder the new folder is created in. Paste a Drive folder URL or the folder ID.",
    },
    {
      name: "folderName",
      label: "Folder name",
      type: "text",
      placeholder: "{{...}} or a plain name",
      help: "Optional when the Folder name input is connected.",
    },
    {
      name: "linkAccess",
      label: "Link sharing",
      type: "select",
      defaultValue: "private",
      options: [
        { value: "private", label: "Private - inherit parent permissions" },
        { value: "reader", label: "Anyone with the link can view" },
        { value: "commenter", label: "Anyone with the link can comment" },
        { value: "writer", label: "Anyone with the link can edit" },
      ],
      help: "Drive allows one link role per folder, so this replaces any existing link sharing.",
    },
    {
      name: "reuseExisting",
      label: "Reuse a folder that already has this name",
      type: "boolean",
      defaultValue: true,
      help: "On means a re-run returns the existing folder. Off creates another folder with the same name.",
    },
  ],
  configSchema: googleDriveCreateFolderConfigSchema,
};
