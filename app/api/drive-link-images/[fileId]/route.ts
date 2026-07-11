import { NextResponse } from "next/server";
import { normalizeHeicImageForPreview } from "@/lib/images/normalize";

export const runtime = "nodejs";

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

function driveDirectLink(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!DRIVE_FILE_ID.test(fileId)) {
    return NextResponse.json({ error: "Invalid Drive file ID." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(driveDirectLink(fileId), {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      return NextResponse.json(
        { error: `Google Drive image fetch failed (${res.status}): ${message}` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { error: `Google Drive returned ${contentType}, not an image.` },
        { status: 502 },
      );
    }

    const preview = await normalizeHeicImageForPreview({
      bytes: await res.arrayBuffer(),
      contentType,
    });

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
  } finally {
    clearTimeout(timeout);
  }
}
