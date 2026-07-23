import { NextResponse } from "next/server";
import { getRun } from "@/lib/workflows/runs-service";
import { inngest, runResumeEvent } from "@/lib/inngest/client";

/**
 * Resume a paused review run with the human's chosen item. Auth-gated
 * by the proxy matcher (only /api/auth and /api/hooks are public), and further
 * guarded by the per-run resumeToken.
 *
 * The actual resume runs in Inngest. We pre-validate the token here so a bad or
 * expired token still gets the UI's immediate 400 (the engine re-validates inside
 * `workflow/run.resume`), then enqueue and return 202.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/workflows/runs/[runId]/resume">,
) {
  const { runId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    resumeToken?: string;
    url?: string;
    objectPosition?: string;
    scale?: number;
    selectedUrls?: string[];
    selectedImages?: {
      url?: string;
      objectPosition?: string;
      scale?: number;
    }[];
  } | null;

  const hasSingleChoice = typeof body?.url === "string" && body.url.trim() !== "";
  // Optional crop/zoom that travels with a single locked image (preview-design-image).
  const singleObjectPosition =
    typeof body?.objectPosition === "string" && body.objectPosition.trim()
      ? body.objectPosition.trim()
      : undefined;
  const singleScale =
    typeof body?.scale === "number" && Number.isFinite(body.scale)
      ? Math.min(4, Math.max(1, body.scale))
      : undefined;
  const selectedImages = Array.isArray(body?.selectedImages)
    ? body.selectedImages
        .map((image) => ({
          url: typeof image.url === "string" ? image.url.trim() : "",
          objectPosition:
            typeof image.objectPosition === "string"
              ? image.objectPosition.trim()
              : undefined,
          scale:
            typeof image.scale === "number" && Number.isFinite(image.scale)
              ? Math.min(4, Math.max(1, image.scale))
              : undefined,
        }))
        .filter((image) => image.url)
    : [];
  const hasCuratedImages = selectedImages.length > 0;
  const hasCuratedSelection =
    Array.isArray(body?.selectedUrls) &&
    body.selectedUrls.some((url) => typeof url === "string" && url.trim() !== "");

  if (
    !body?.resumeToken ||
    (!hasSingleChoice && !hasCuratedImages && !hasCuratedSelection)
  ) {
    return NextResponse.json(
      { error: "resumeToken and url, selectedImages, or selectedUrls are required" },
      { status: 400 },
    );
  }

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 400 });
  }
  if (run.status !== "waiting" || !run.waitingNodeId) {
    return NextResponse.json(
      { error: "Run is not awaiting input" },
      { status: 400 },
    );
  }
  if (!run.resumeToken || run.resumeToken !== body.resumeToken) {
    return NextResponse.json({ error: "Invalid resume token" }, { status: 400 });
  }

  // Dedupe on the single-use token, so a double-click (or a sender retry) enqueues
  // exactly one resume regardless of the async gap before the run leaves `waiting`.
  const choice = hasSingleChoice
    ? {
        choiceUrl: body.url!.trim(),
        ...(singleObjectPosition ? { objectPosition: singleObjectPosition } : {}),
        ...(singleScale !== undefined ? { scale: singleScale } : {}),
      }
    : hasCuratedImages
      ? { selectedImages }
      : {
          selectedUrls: body.selectedUrls!.map((url) => url.trim()).filter(Boolean),
        };

  await inngest.send(
    runResumeEvent.create(
      {
        runId,
        resumeToken: body.resumeToken,
        ...choice,
      },
      { id: `${runId}:resume:${body.resumeToken}` },
    ),
  );
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
