import { NextResponse } from "next/server";
import {
  fetchGoogleDriveImageFile,
  verifyGoogleDriveImageSignature,
} from "@/lib/connections/google-drive/api";

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
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
