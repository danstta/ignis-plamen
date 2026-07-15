import { type NextRequest, NextResponse } from "next/server";
import {
  fetchInstagramRecentPosts,
  InstagramPreviewError,
  normalizeInstagramUsername,
} from "@/lib/instagram/recent-posts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const username = normalizeInstagramUsername(
    request.nextUrl.searchParams.get("username") ?? "",
  );

  if (!username) {
    return NextResponse.json(
      { error: "A valid username query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const posts = await fetchInstagramRecentPosts(username);
    return NextResponse.json({ username, posts });
  } catch (error) {
    const status = error instanceof InstagramPreviewError ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}
