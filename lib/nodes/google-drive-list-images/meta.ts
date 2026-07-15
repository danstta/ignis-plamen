import { z } from "zod";
import type { NodeMeta } from "../types";

export const GOOGLE_DRIVE_LIST_IMAGES_TYPE_ID = "google-drive-list-images";

export const googleDriveListImagesConfigSchema = z.object({
  connectionId: z.string().default(""),
  folder: z.string().default(""),
  maxImages: z.coerce.number().int().min(1).max(1000).default(100),
  selectionCount: z.coerce.number().int().min(1).max(50).default(5),
});

export type GoogleDriveListImagesConfig = z.infer<
  typeof googleDriveListImagesConfigSchema
>;

export const googleDriveListImagesMeta: NodeMeta<GoogleDriveListImagesConfig> = {
  id: GOOGLE_DRIVE_LIST_IMAGES_TYPE_ID,
  label: "List Drive Images",
  description: "Lists image files inside a Google Drive folder and its subfolders.",
  category: "source",
  group: "google-drive",
  inputs: [],
  outputs: [
    { id: "links", label: "Image links", kind: "data" },
    { id: "directLinks", label: "Direct links", kind: "data" },
    { id: "selected", label: "Selected images", kind: "data" },
    { id: "selectedUrls", label: "Selected image URLs", kind: "data" },
    { id: "firstLink", label: "First image link", kind: "text" },
    { id: "firstDirectLink", label: "First direct image", kind: "image" },
    { id: "images", label: "Images", kind: "data" },
    { id: "count", label: "Count", kind: "data" },
  ],
  configFields: [
    {
      name: "connectionId",
      label: "Google Drive connection",
      type: "connection",
      connectionTypes: ["google-drive"],
      help: "Choose the Drive account that can access this folder.",
    },
    {
      name: "folder",
      label: "Folder link or ID",
      type: "text",
      placeholder: "https://drive.google.com/drive/folders/... or folder ID",
      help: "Paste a Google Drive folder URL or the folder ID itself.",
    },
    {
      name: "maxImages",
      label: "Max images",
      type: "number",
      placeholder: "100",
      help: "Caps how many image files this node returns from the folder tree.",
    },
    {
      name: "selectionCount",
      label: "Images to expose",
      type: "number",
      placeholder: "5",
      help: "Makes the first N Drive images available as Selected images and Selected image URLs.",
    },
  ],
  configSchema: googleDriveListImagesConfigSchema,
};
