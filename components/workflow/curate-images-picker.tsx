"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoveDown, MoveUp, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Candidate = { url: string; attribution?: string };
type PreviewPlaceholder = { key: string; kind: "text" | "image" };

function uniqueByUrl(images: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function ImageTile({
  image,
  action,
  label,
  disabled,
  children,
}: {
  image: Candidate;
  action: () => void;
  label: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt="" className="aspect-square w-full object-cover" />
      {children}
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        onClick={action}
        disabled={disabled}
        aria-label={label}
        className="absolute right-2 top-2 opacity-90 shadow-sm transition-opacity group-hover:opacity-100"
      >
        {label === "Remove" ? <X className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}

function buildPreviewData(
  placeholders: PreviewPlaceholder[],
  bindings: Record<string, unknown>,
  selectedUrls: string[],
): Record<string, string> {
  const data: Record<string, string> = {};
  let imageIndex = 0;

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    const value =
      bound === null || bound === undefined
        ? ""
        : typeof bound === "string"
          ? bound
          : JSON.stringify(bound);
    if (placeholder.kind === "image") {
      data[placeholder.key] = value || selectedUrls[imageIndex] || "";
      imageIndex += 1;
    } else {
      data[placeholder.key] = value;
    }
  }

  return data;
}

export function CurateImagesPicker({
  runId,
  resumeToken,
  selected,
  alternates,
  selectionCount,
  previewTemplateId,
  previewPlaceholders = [],
  previewBindings = {},
}: {
  runId: string;
  resumeToken: string;
  selected: Candidate[];
  alternates: Candidate[];
  selectionCount: number;
  previewTemplateId?: string;
  previewPlaceholders?: PreviewPlaceholder[];
  previewBindings?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [selectedUrls, setSelectedUrls] = useState(() =>
    uniqueByUrl(selected)
      .slice(0, selectionCount)
      .map((image) => image.url),
  );
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const allImages = useMemo(
    () => uniqueByUrl([...selected, ...alternates]),
    [selected, alternates],
  );
  const byUrl = useMemo(
    () => new Map(allImages.map((image) => [image.url, image])),
    [allImages],
  );
  const selectedImages = selectedUrls.flatMap((url) => {
    const image = byUrl.get(url);
    return image ? [image] : [];
  });
  const alternateImages = allImages.filter(
    (image) => !selectedUrls.includes(image.url),
  );

  function remove(url: string) {
    setSelectedUrls((current) => current.filter((item) => item !== url));
  }

  function move(url: string, direction: -1 | 1) {
    setSelectedUrls((current) => {
      const index = current.indexOf(url);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function add(url: string) {
    setSelectedUrls((current) => {
      if (current.includes(url) || current.length >= selectionCount) return current;
      return [...current, url];
    });
  }

  useEffect(() => {
    if (!previewTemplateId || selectedUrls.length === 0) {
      return;
    }

    const controller = new AbortController();
    const previousUrl = previewUrl;

    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      void fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: previewTemplateId,
          data: buildPreviewData(
            previewPlaceholders,
            previewBindings,
            selectedUrls,
          ),
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
          return res.blob();
        })
        .then((blob) => {
          const nextUrl = URL.createObjectURL(blob);
          setPreviewUrl(nextUrl);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setPreviewError(String(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // previewUrl is intentionally omitted so each render captures the previous URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTemplateId, previewPlaceholders, previewBindings, selectedUrls]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function submit() {
    if (selectedUrls.length === 0) {
      toast.error("Choose at least one image before continuing");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, selectedUrls }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success("Image set selected - finishing run");
      router.refresh();
    } catch (err) {
      toast.error("Failed to submit selection", { description: String(err) });
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedImages.length}/{selectionCount} selected
          </p>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={submitting || selectedImages.length === 0}
          >
            <Check className="size-4" />
            Continue
          </Button>
        </div>

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Selected
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {selectedImages.map((image, index) => (
              <ImageTile
                key={image.url}
                image={image}
                action={() => remove(image.url)}
                label="Remove"
                disabled={submitting}
              >
                <div className="absolute left-2 top-2 flex gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label="Move earlier"
                    disabled={submitting || index === 0}
                    onClick={() => move(image.url, -1)}
                    className="opacity-90 shadow-sm"
                  >
                    <MoveUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label="Move later"
                    disabled={submitting || index === selectedImages.length - 1}
                    onClick={() => move(image.url, 1)}
                    className="opacity-90 shadow-sm"
                  >
                    <MoveDown className="size-3" />
                  </Button>
                </div>
              </ImageTile>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Alternates
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {alternateImages.map((image) => (
              <ImageTile
                key={image.url}
                image={image}
                action={() => add(image.url)}
                label="Add"
                disabled={submitting || selectedImages.length >= selectionCount}
              />
            ))}
          </div>
        </section>
      </div>

      {previewTemplateId ? (
        <aside className="min-w-0">
          <div className="sticky top-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-muted-foreground">
                Template preview
              </h3>
              {previewLoading ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <RefreshCw className="size-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="overflow-hidden rounded-md border bg-muted/20">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="w-full" />
              ) : (
                <div className="flex aspect-square items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  {selectedUrls.length === 0
                    ? "Choose images to render a preview."
                    : (previewError ?? "Rendering preview...")}
                </div>
              )}
            </div>
            {previewError ? (
              <p className="mt-2 text-xs text-destructive">{previewError}</p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
