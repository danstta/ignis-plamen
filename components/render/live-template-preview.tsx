"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplatePreview } from "./template-preview";
import {
  pageView,
  type PlaceholderData,
  type TemplateDoc,
} from "@/lib/editor/types";
import { previewImageSources } from "@/lib/render/preview-images";
import type { PreviewableImage } from "@/lib/nodes/image-preview";
import { cn } from "@/lib/utils";

type Props = {
  templateId: string;
  data: PlaceholderData;
  images: PreviewableImage[];
};

/** A template is loaded once per visit; image/crop changes only update its DOM. */
export function LiveTemplatePreview(props: Props) {
  return <LoadedTemplatePreview key={props.templateId} {...props} />;
}

function LoadedTemplatePreview({ templateId, data, images }: Props) {
  const [doc, setDoc] = useState<TemplateDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [imageAttempt, setImageAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let active = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/templates/${encodeURIComponent(templateId)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "This template is no longer available."
              : "Could not load the template.",
          );
        }
        const { doc: loaded } = (await res.json()) as { doc: TemplateDoc };
        if (
          !Array.isArray(loaded?.pages) ||
          loaded.pages.length === 0 ||
          !Number.isFinite(loaded.width) ||
          !Number.isFinite(loaded.height) ||
          loaded.width <= 0 ||
          loaded.height <= 0
        ) {
          throw new Error("This template has no valid preview.");
        }
        if (active) setDoc(loaded);
      } catch (err) {
        if (active) {
          setError(
            controller.signal.aborted
              ? "Loading the template timed out. Try again."
              : err instanceof Error
                ? err.message
                : "Could not load the template.",
          );
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [templateId, attempt]);

  const canvas = useMemo(
    () => (doc ? pageView(doc, doc.pages[activePage] ?? doc.pages[0]) : null),
    [doc, activePage],
  );
  const imageSources = useMemo(
    () => (canvas ? previewImageSources(canvas, data, images) : undefined),
    [canvas, data, images],
  );
  const hasFailedImage = imageSources &&
    [...imageSources.values()].some((src) => failedImages.includes(src));

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20">
      {doc && doc.pages.length > 1 ? (
        <div
          role="group"
          aria-label="Preview pages"
          className="flex gap-1 overflow-x-auto border-b bg-card p-1"
        >
          {doc.pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              aria-label={`Preview page ${index + 1}`}
              aria-pressed={activePage === index}
              className={cn(
                "h-6 shrink-0 rounded px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                activePage === index && "bg-muted text-foreground",
              )}
              onClick={() => setActivePage(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : null}
      {canvas ? (
        <div
          style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
          onErrorCapture={(event) => {
            if (!(event.target instanceof HTMLImageElement)) return;
            const src = event.target.getAttribute("src");
            if (src) {
              setFailedImages((current) =>
                current.includes(src) ? current : [...current, src],
              );
            }
          }}
          onLoadCapture={(event) => {
            if (!(event.target instanceof HTMLImageElement)) return;
            const src = event.target.getAttribute("src");
            setFailedImages((current) =>
              current.includes(src ?? "")
                ? current.filter((failed) => failed !== src)
                : current,
            );
          }}
        >
          <TemplatePreview
            key={imageAttempt}
            canvas={canvas}
            data={data}
            imageSources={imageSources}
            className="h-full w-full"
          />
        </div>
      ) : (
        <div className="flex aspect-square flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setAttempt((current) => current + 1);
                }}
              >
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" />
              <p role="status">Loading template...</p>
            </>
          )}
        </div>
      )}
      {hasFailedImage ? (
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <p role="alert" className="text-xs text-destructive">
            An image could not be loaded.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setFailedImages([]);
              setImageAttempt((current) => current + 1);
            }}
          >
            Retry images
          </Button>
        </div>
      ) : null}
    </div>
  );
}
