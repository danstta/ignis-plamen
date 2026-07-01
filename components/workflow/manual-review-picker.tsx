"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Grid2X2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Candidate = { url: string; attribution?: string };
type InstagramPreview = { enabled?: boolean; username?: string };
type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink?: string;
  mediaType?: string;
  timestamp?: string;
  caption?: string;
};

/** Grid of candidates for a paused run; clicking one resumes the run. */
export function ManualReviewPicker({
  runId,
  resumeToken,
  candidates,
  itemLabel = "image",
  instagramPreview,
}: {
  runId: string;
  resumeToken: string;
  candidates: Candidate[];
  itemLabel?: string;
  instagramPreview?: InstagramPreview;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [postsResult, setPostsResult] = useState<{
    username: string;
    posts: InstagramPost[];
    error: string | null;
  } | null>(null);

  const username = instagramPreview?.username?.trim().replace(/^@/, "") ?? "";
  const gridPreviewEnabled = Boolean(instagramPreview?.enabled && username);
  const effectiveSelectedUrl =
    selectedUrl ?? (gridPreviewEnabled ? candidates[0]?.url ?? null : null);
  const posts = useMemo(
    () =>
      postsResult?.username === username && !postsResult.error
        ? postsResult.posts
        : [],
    [postsResult, username],
  );
  const postsError =
    postsResult?.username === username ? postsResult.error : null;
  const loadingPosts = gridPreviewEnabled && postsResult?.username !== username;

  useEffect(() => {
    if (!gridPreviewEnabled) return;

    const controller = new AbortController();
    fetch(`/api/instagram/recent-posts?username=${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          posts?: InstagramPost[];
          error?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error ?? `Instagram returned ${res.status}`);
        setPostsResult({
          username,
          posts: Array.isArray(data?.posts) ? data.posts : [],
          error: null,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPostsResult({
          username,
          posts: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, [gridPreviewEnabled, username]);

  const previewTiles = useMemo(() => {
    const selected = effectiveSelectedUrl
      ? [
          {
            id: "selected-design",
            imageUrl: effectiveSelectedUrl,
            isSelectedDesign: true,
          },
        ]
      : [];
    return [...selected, ...posts].slice(0, 9);
  }, [posts, effectiveSelectedUrl]);

  async function pick(url: string) {
    setSubmitting(url);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, url }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success(
        `${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)} selected - finishing run`,
      );
      router.refresh();
    } catch (err) {
      toast.error("Failed to submit selection", { description: String(err) });
      setSubmitting(null);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No candidate {itemLabel}s were produced.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {candidates.map((c) => {
          const selected = effectiveSelectedUrl === c.url;
          return (
            <button
              key={c.url}
              type="button"
              onClick={() => (gridPreviewEnabled ? setSelectedUrl(c.url) : pick(c.url))}
              disabled={submitting !== null}
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-muted/30 text-left transition-colors hover:border-foreground/40 disabled:opacity-60",
                selected && "border-foreground/70 ring-2 ring-foreground/10",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.url}
                alt=""
                className="aspect-[4/5] w-full object-contain"
              />
              {selected ? (
                <span className="absolute right-2 top-2 rounded-full bg-foreground p-1 text-background">
                  <Check className="size-3.5" />
                </span>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {submitting === c.url
                  ? "Selecting..."
                  : gridPreviewEnabled
                    ? "Preview in grid"
                    : `Use this ${itemLabel}`}
              </span>
            </button>
          );
        })}
      </div>

      {gridPreviewEnabled ? (
        <aside className="rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Grid2X2 className="size-4" /> @{username}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preview as the next post
              </p>
            </div>
            {loadingPosts ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <RefreshCw className="size-4 text-muted-foreground" />
            )}
          </div>

          {postsError ? (
            <p className="mt-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              {postsError}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-3 gap-1 overflow-hidden rounded-md bg-muted p-1">
            {previewTiles.length > 0
              ? previewTiles.map((tile) => (
                  <div
                    key={tile.id}
                    className={cn(
                      "relative aspect-square overflow-hidden bg-background",
                      "isSelectedDesign" in tile &&
                        tile.isSelectedDesign &&
                        "ring-2 ring-inset ring-emerald-500",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tile.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  </div>
                ))
              : Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse bg-background"
                  />
                ))}
          </div>

          <Button
            type="button"
            className="mt-3 w-full"
            disabled={!effectiveSelectedUrl || submitting !== null}
            onClick={() => effectiveSelectedUrl && pick(effectiveSelectedUrl)}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {submitting ? "Selecting" : `Use selected ${itemLabel}`}
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
