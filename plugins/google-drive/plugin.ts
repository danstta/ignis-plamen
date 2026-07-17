import type { NodeMeta } from "@/lib/nodes/types";
import type { PluginManifest } from "@/lib/plugins/types";
import { googleDriveListImagesMeta } from "./nodes/google-drive-list-images/meta";
import { googleDriveUploadFilesMeta } from "./nodes/google-drive-upload-files/meta";

export const googleDrivePlugin: PluginManifest = {
  id: "google-drive",
  name: "Google Drive",
  description: "Reads and writes Google Drive folders and files from workflows.",
  defaultEnabled: true,
  nodes: [
    googleDriveListImagesMeta as unknown as NodeMeta,
    googleDriveUploadFilesMeta as unknown as NodeMeta,
  ],
};
