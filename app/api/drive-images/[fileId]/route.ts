import { NextResponse } from "next/server";
import {
  fetchGoogleDriveImageFile,
  verifyGoogleDriveImageSignature,
} from "@/lib/connections/google-drive/api";
import { normalizeHeicImageForPreview } from "@/lib/images/normalize";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";
  const signature = url.searchParams.get("sig")?.trim() ?? "";

  if (!connectionId || !fileId || !signature) {
    return NextResponse.json({ error: "Missing image parameters." }, { status: 400 });
  }
  if (
    !verifyGoogleDriveImageSignature({
      connectionId,
      fileId,
      signature,
    })
  ) {
    return NextResponse.json({ error: "Invalid image signature." }, { status: 403 });
  }

  try {
    const image = await fetchGoogleDriveImageFile({ connectionId, fileId });
    const preview = await normalizeHeicImageForPreview(image);
    return new Response(new Uint8Array(preview.bytes), {
      headers: {
        "Content-Type": preview.contentType,
        "Cache-Control": "private, max-age=300",
        ...(preview.converted ? { "X-Ignis-Image-Converted": "heic-to-jpeg" } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
