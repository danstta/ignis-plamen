import { getConnection } from "@/lib/connections/service";
import {
  listGoogleDriveFolderImages,
  parseGoogleDriveFolderId,
} from "@/lib/connections/google-drive/api";
import type { NodeDefinition } from "../types";
import {
  googleDriveListImagesMeta,
  type GoogleDriveListImagesConfig,
} from "./meta";

export const googleDriveListImagesNode: NodeDefinition<GoogleDriveListImagesConfig> = {
  ...googleDriveListImagesMeta,

  async run(ctx) {
    const connection = await getConnection(ctx.config.connectionId);
    if (!connection || connection.type !== "google-drive") {
      throw new Error("Select a valid Google Drive connection");
    }

    const folderId = parseGoogleDriveFolderId(ctx.config.folder);
    const images = await listGoogleDriveFolderImages({
      connectionId: ctx.config.connectionId,
      folder: folderId,
      maxImages: ctx.config.maxImages,
    });

    ctx.log(`found ${images.length} image file(s) in Drive folder ${folderId}`);

    return {
      type: "output",
      outputs: {
        folderId,
        count: images.length,
        links: images.map((image) => image.webViewLink),
        directLinks: images.map((image) => image.directLink),
        firstLink: images[0]?.webViewLink ?? "",
        firstDirectLink: images[0]?.directLink ?? "",
        images,
      },
    };
  },
};
