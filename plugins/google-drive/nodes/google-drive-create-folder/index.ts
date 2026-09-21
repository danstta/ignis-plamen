import { getConnection } from "@/lib/connections/service";
import {
  createGoogleDriveFolder,
  setGoogleDriveLinkAccess,
} from "@/lib/connections/google-drive/api";
import type { NodeDefinition } from "@/lib/nodes/types";
import { valueToText } from "@/lib/workflows/references";
import {
  googleDriveCreateFolderMeta,
  type GoogleDriveCreateFolderConfig,
} from "./meta";

const ACCESS_LABELS: Record<GoogleDriveCreateFolderConfig["linkAccess"], string> = {
  private: "private",
  reader: "anyone with the link can view",
  commenter: "anyone with the link can comment",
  writer: "anyone with the link can edit",
};

export const googleDriveCreateFolderNode: NodeDefinition<GoogleDriveCreateFolderConfig> =
  {
    ...googleDriveCreateFolderMeta,

    async run(ctx) {
      const connection = await getConnection(ctx.config.connectionId);
      if (!connection || connection.type !== "google-drive") {
        throw new Error("Select a valid Google Drive connection");
      }

      const name =
        valueToText(ctx.inputs.folderName).trim() || ctx.config.folderName.trim();
      if (!name) {
        throw new Error("Add a folder name or connect the Folder name input");
      }

      const folder = await createGoogleDriveFolder({
        connectionId: ctx.config.connectionId,
        parent: ctx.config.parentFolder,
        name,
        reuseExisting: ctx.config.reuseExisting,
      });

      ctx.log(
        `${folder.reused ? "reused" : "created"} Drive folder "${folder.name}" (${folder.id})`,
      );

      await setGoogleDriveLinkAccess({
        connectionId: ctx.config.connectionId,
        fileId: folder.id,
        access: ctx.config.linkAccess,
      });

      if (ctx.config.linkAccess !== "private") {
        ctx.log(`link sharing set to ${ACCESS_LABELS[ctx.config.linkAccess]}`);
      }

      return {
        type: "output",
        outputs: {
          folderId: folder.id,
          folderUrl: folder.webViewLink,
          folderName: folder.name,
          linkAccess: ctx.config.linkAccess,
          reused: folder.reused,
          folder,
        },
      };
    },
  };
