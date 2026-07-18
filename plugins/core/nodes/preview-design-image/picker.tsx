"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { imagePreviewSrc } from "@/lib/nodes/image-preview";
import type { PlaceholderDescriptor } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

type Candidate = {
  url: string;
  attribution?: string;
  previewUrl?: string;
  thumbnailLink?: string;
  mimeType?: string;
  name?: string;
  title?: string;
  source?: string;
  locationQuery?: string;
  locationQueryIndex?: number;
};
type PreviewPlaceholder = PlaceholderDescriptor;
type CandidateGroup = {
  key: string;
  label: string;
  candidates: { candidate: Candidate; index: number }[];
};

function outputText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(outputText).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

function buildPreviewData({
  placeholders,
  bindings,
  dynamicKey,
  selectedUrl,
}: {
  placeholders: PreviewPlaceholder[];
  bindings: Record<string, unknown>;
  dynamicKey: string;
  selectedUrl: string;
}): Record<string, string> {
  const data: Record<string, string> = {};

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    data[placeholder.key] =
      placeholder.key === dynamicKey
        ? selectedUrl
        : bound !== undefined && bound !== ""
          ? outputText(bound)
          : "";
  }

  return data;
}

function candidateGroups(candidates: Candidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();

  candidates.forEach((candidate, index) => {
    const query = candidate.locationQuery?.trim() || "";
    const groupKey = query
      ? `${candidate.locationQueryIndex ?? "query"}:${query}`
      : "ungrouped";
    const group = groups.get(groupKey);
    if (group) {
      group.candidates.push({ candidate, index });
      return;
    }
    groups.set(groupKey, {
      key: groupKey,
      label: query || "Location query",
      candidates: [{ candidate, index }],
    });
  });

  return [...groups.values()];
}

export function PreviewDesignImagePicker({
  runId,
  resumeToken,
  candidates,
  previewTemplateId,
  previewPlaceholders = [],
  previewBindings = {},
  dynamicImagePlaceholderKey,
}: {
  runId: string;
  resumeToken: string;
  candidates: Candidate[];
  previewTemplateId: string;
  previewPlaceholders?: PreviewPlaceholder[];
  previewBindings?: Record<string, unknown>;
  dynamicImagePlaceholderKey: string;
}) {
  const router = useRouter();
  const [selectedUrl, setSelectedUrl] = useState(candidates[0]?.url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.url === selectedUrl),
    [candidates, selectedUrl],
  );
  const groups = useMemo(() => candidateGroups(candidates), [candidates]);
  const grouped = groups.length > 1 || groups[0]?.key !== "ungrouped";

  useEffect(() => {
    if (!previewTemplateId || !selectedUrl || !dynamicImagePlaceholderKey) {
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
          data: buildPreviewData({
            placeholders: previewPlaceholders,
            bindings: previewBindings,
            dynamicKey: dynamicImagePlaceholderKey,
            selectedUrl,
          }),
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
          setPreviewError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // previewUrl is intentionally omitted so each render captures the URL it replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    previewTemplateId,
    previewPlaceholders,
    previewBindings,
    dynamicImagePlaceholderKey,
    selectedUrl,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function lockImage() {
    if (!selectedUrl) {
      toast.error("Choose an image before locking the preview");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, url: selectedUrl }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success("Image locked - finishing run");
      router.refresh();
    } catch (err) {
      toast.error("Failed to lock image", { description: String(err) });
      setSubmitting(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No candidate images were produced.
      </p>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {candidates.length} image{candidates.length === 1 ? "" : "s"} available
          </p>
          <Button
            type="button"
            size="sm"
            onClick={lockImage}
            disabled={submitting || !selectedUrl}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {submitting ? "Locking" : "Lock image"}
          </Button>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key} className="min-w-0">
              {grouped ? (
                <div className="mb-2 flex items-center justify-between gap-3 border-b pb-1.5">
                  <h3 className="min-w-0 truncate text-xs font-medium text-foreground">
                    {group.label}
                  </h3>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {group.candidates.length}
                  </span>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {group.candidates.map(({ candidate, index }) => {
                  const active = candidate.url === selectedUrl;
                  return (
                    <button
                      key={candidate.url}
                      type="button"
                      onClick={() => setSelectedUrl(candidate.url)}
                      disabled={submitting}
                      className={cn(
                        "group relative min-w-0 overflow-hidden rounded-md border bg-muted/25 text-left outline-none transition hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                        active && "border-foreground/70 ring-2 ring-foreground/10",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreviewSrc(candidate)}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums shadow-sm">
                        {index + 1}
                      </span>
                      {active ? (
                        <span className="absolute right-2 top-2 rounded-full bg-foreground p-1 text-background shadow-sm">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {candidate.source ?? "Preview this image"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <aside className="min-w-0">
        <div className="sticky top-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ImageIcon className="size-3.5" />
                Design preview
              </h3>
              {selected?.title ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {selected.title}
                </p>
              ) : null}
            </div>
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
                {previewError ?? "Rendering preview..."}
              </div>
            )}
          </div>
          {previewError ? (
            <p className="mt-2 text-xs text-destructive">{previewError}</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
