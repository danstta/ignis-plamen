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

    ctx.log(
      `found ${images.length} image file(s) in Drive folder tree ${folderId}`,
    );

    const selected = images.slice(0, ctx.config.selectionCount);

    return {
      type: "output",
      outputs: {
        folderId,
        count: images.length,
        links: images.map((image) => image.webViewLink),
        directLinks: images.map((image) => image.directLink),
        selected,
        selectedUrls: selected.map((image) => image.url),
        firstLink: images[0]?.webViewLink ?? "",
        firstDirectLink: images[0]?.directLink ?? "",
        images,
      },
    };
  },
};
