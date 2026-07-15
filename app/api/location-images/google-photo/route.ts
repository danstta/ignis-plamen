import { NextResponse } from "next/server";
import {
  fetchGooglePlacePhoto,
  isGooglePlacePhotoName,
  verifyGooglePlacePhotoSignature,
} from "@/lib/location-images/google-places";

const MIN_WIDTH = 200;
const MAX_WIDTH = 4000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  const signature = url.searchParams.get("sig")?.trim() ?? "";
  const maxWidthPx = Math.trunc(Number(url.searchParams.get("w") ?? ""));

  if (!isGooglePlacePhotoName(name)) {
    return NextResponse.json({ error: "Invalid Google photo name." }, { status: 400 });
  }
  if (
    !Number.isFinite(maxWidthPx) ||
    maxWidthPx < MIN_WIDTH ||
    maxWidthPx > MAX_WIDTH
  ) {
    return NextResponse.json({ error: "Invalid width." }, { status: 400 });
  }
  if (!verifyGooglePlacePhotoSignature(name, maxWidthPx, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  try {
    const photo = await fetchGooglePlacePhoto({ name, maxWidthPx });
    return new Response(photo.bytes, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
