import type { NodeDefinition } from "@/lib/nodes/types";
import type { PluginServer } from "@/lib/plugins/types";
import { googleDriveListImagesNode } from "./nodes/google-drive-list-images";
import { googleDriveUploadFilesNode } from "./nodes/google-drive-upload-files";

export const googleDrivePluginServer: PluginServer = {
  id: "google-drive",
  nodes: [
    googleDriveListImagesNode as unknown as NodeDefinition,
    googleDriveUploadFilesNode as unknown as NodeDefinition,
  ],
};
