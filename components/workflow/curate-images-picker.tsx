"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Crosshair,
  Loader2,
  MoveDown,
  MoveUp,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isPlaceholderImageValue,
  placeholderValueToText,
  type PlaceholderData,
  type PlaceholderValue,
} from "@/lib/editor/types";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";
import { cn } from "@/lib/utils";

type Candidate = { url: string; attribution?: string };
type PreviewPlaceholder = { key: string; kind: "text" | "image" };
type ImagePlacement = { objectPosition: string; scale: number };
type SelectedImageValue = { url: string } & ImagePlacement;

const DEFAULT_PLACEMENT: ImagePlacement = {
  objectPosition: "center center",
  scale: 1,
};

const POSITION_PRESETS = [
  { value: "left top", label: "Top left", icon: ArrowUp },
  { value: "center top", label: "Top", icon: ArrowUp },
  { value: "right top", label: "Top right", icon: ArrowUp },
  { value: "left center", label: "Left", icon: ArrowLeft },
  { value: "center center", label: "Center", icon: Crosshair },
  { value: "right center", label: "Right", icon: ArrowRight },
  { value: "left bottom", label: "Bottom left", icon: ArrowDown },
  { value: "center bottom", label: "Bottom", icon: ArrowDown },
  { value: "right bottom", label: "Bottom right", icon: ArrowDown },
] as const;

async function renderPreviewPage(input: {
  templateId: string;
  page: number;
  data: PlaceholderData;
  signal: AbortSignal;
}): Promise<{ url: string; pageCount: number }> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId: input.templateId,
      page: input.page,
      data: input.data,
    }),
    signal: input.signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const pageCount = Math.max(
    1,
    Math.trunc(Number(res.headers.get("X-Page-Count") ?? "1")),
  );
  return {
    url: URL.createObjectURL(await res.blob()),
    pageCount,
  };
}

function uniqueByUrl(images: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function placementFor(
  placements: Record<string, ImagePlacement>,
  url: string,
): ImagePlacement {
  return placements[url] ?? DEFAULT_PLACEMENT;
}

function selectedImageValue(
  url: string,
  placement: ImagePlacement,
): SelectedImageValue {
  return { url, ...placement };
}

function hasCustomPlacement(placement: ImagePlacement): boolean {
  return (
    placement.objectPosition !== DEFAULT_PLACEMENT.objectPosition ||
    placement.scale !== DEFAULT_PLACEMENT.scale
  );
}

function imagePlaceholderValue(image: SelectedImageValue | undefined): PlaceholderValue {
  if (!image) return "";
  if (!hasCustomPlacement(image)) return image.url;
  return {
    url: image.url,
    objectPosition: image.objectPosition,
    scale: image.scale,
  };
}

function valueForImagePlaceholder(value: unknown): PlaceholderValue {
  if (isPlaceholderImageValue(value)) return value;
  if (typeof value === "string") return value;
  if (value === null || value === undefined || value === "") return "";
  return JSON.stringify(value);
}

function valueForTextPlaceholder(value: unknown): string {
  if (isPlaceholderImageValue(value) || typeof value === "string") {
    return placeholderValueToText(value);
  }
  if (value === null || value === undefined || value === "") return "";
  return JSON.stringify(value);
}

function ImageTile({
  image,
  action,
  label,
  disabled,
  children,
  className,
}: {
  image: Candidate;
  action: () => void;
  label: string;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md border bg-muted/20",
        className,
      )}
    >
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
        className="absolute right-2 top-2 opacity-[0.85] shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label === "Remove" ? <X className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={active ? "default" : "secondary"}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={className}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PlacementControls({
  image,
  placement,
  disabled,
  onPositionChange,
  onScaleChange,
  onReset,
  onMoveEarlier,
  onMoveLater,
  activeIndex,
  canMoveEarlier,
  canMoveLater,
}: {
  image?: Candidate;
  placement: ImagePlacement;
  disabled?: boolean;
  onPositionChange: (objectPosition: string) => void;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  activeIndex?: number;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}) {
  return (
    <div className="mt-3 grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt=""
            className="aspect-square w-full object-cover"
            style={{
              objectPosition: placement.objectPosition,
              transform: `scale(${placement.scale})`,
            }}
          />
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-medium text-muted-foreground">
              Position
            </span>
            {activeIndex !== undefined ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Image {activeIndex + 1}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <ToolButton
              label="Move earlier"
              disabled={disabled || !canMoveEarlier}
              onClick={onMoveEarlier}
            >
              <MoveUp className="size-3" />
            </ToolButton>
            <ToolButton
              label="Move later"
              disabled={disabled || !canMoveLater}
              onClick={onMoveLater}
            >
              <MoveDown className="size-3" />
            </ToolButton>
            <ToolButton
              label="Reset framing"
              disabled={disabled || !hasCustomPlacement(placement)}
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
            </ToolButton>
          </div>
        </div>

        <div className="grid w-fit grid-cols-3 gap-1">
          {POSITION_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <ToolButton
                key={preset.value}
                label={preset.label}
                active={placement.objectPosition === preset.value}
                disabled={disabled}
                onClick={() => onPositionChange(preset.value)}
              >
                <Icon className="size-3" />
              </ToolButton>
            );
          })}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium">
              <ZoomIn className="size-3" />
              Zoom
            </span>
            <span className="tabular-nums">{Math.round(placement.scale * 100)}%</span>
          </div>
          <Slider
            value={[placement.scale]}
            min={1}
            max={3}
            step={0.05}
            disabled={disabled}
            onValueChange={(value) =>
              onScaleChange(Array.isArray(value) ? (value[0] ?? 1) : value)
            }
          />
        </div>
      </div>
    </div>
  );
}

function buildPreviewData(
  placeholders: PreviewPlaceholder[],
  bindings: Record<string, unknown>,
  selectedImages: SelectedImageValue[],
): PlaceholderData {
  const data: PlaceholderData = {};
  let imageIndex = 0;

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    if (placeholder.kind === "image") {
      const value = valueForImagePlaceholder(bound);
      data[placeholder.key] =
        value || imagePlaceholderValue(selectedImages[imageIndex]);
      imageIndex += 1;
    } else {
      data[placeholder.key] = valueForTextPlaceholder(bound);
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
  const normalizedSelected = useMemo(
    () => normalizeImageCandidates(selected),
    [selected],
  );
  const normalizedAlternates = useMemo(
    () => normalizeImageCandidates(alternates),
    [alternates],
  );
  const [selectedUrls, setSelectedUrls] = useState(() =>
    uniqueByUrl(normalizedSelected)
      .slice(0, selectionCount)
      .map((image) => image.url),
  );
  const [placements, setPlacements] = useState<Record<string, ImagePlacement>>(
    {},
  );
  const [activePlacementUrl, setActivePlacementUrl] = useState(
    () => selectedUrls[0] ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const allImages = useMemo(
    () => uniqueByUrl([...normalizedSelected, ...normalizedAlternates]),
    [normalizedSelected, normalizedAlternates],
  );
  const byUrl = useMemo(
    () => new Map(allImages.map((image) => [image.url, image])),
    [allImages],
  );
  const selectedImages = selectedUrls.flatMap((url) => {
    const image = byUrl.get(url);
    return image ? [image] : [];
  });
  const selectedImageValues = useMemo(
    () =>
      selectedUrls.map((url) =>
        selectedImageValue(url, placementFor(placements, url)),
      ),
    [placements, selectedUrls],
  );
  const alternateImages = allImages.filter(
    (image) => !selectedUrls.includes(image.url),
  );
  const effectiveActivePlacementUrl = selectedUrls.includes(activePlacementUrl)
    ? activePlacementUrl
    : (selectedUrls[0] ?? "");
  const activePlacement =
    effectiveActivePlacementUrl
      ? placementFor(placements, effectiveActivePlacementUrl)
      : null;
  const activePlacementIndex = selectedUrls.indexOf(
    effectiveActivePlacementUrl,
  );
  const activePreviewUrl =
    previewUrls[activePreviewPage] ?? previewUrls[0] ?? null;

  function replacePreviewUrls(nextUrls: string[]) {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = nextUrls;
    setPreviewUrls(nextUrls);
    setActivePreviewPage((page) =>
      nextUrls.length === 0 ? 0 : Math.min(page, nextUrls.length - 1),
    );
  }

  function remove(url: string) {
    setSelectedUrls((current) => current.filter((item) => item !== url));
    setPlacements((current) => {
      if (!current[url]) return current;
      const next = { ...current };
      delete next[url];
      return next;
    });
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
    if (!selectedUrls.includes(url) && selectedUrls.length < selectionCount) {
      setActivePlacementUrl(url);
    }
    setSelectedUrls((current) => {
      if (current.includes(url) || current.length >= selectionCount) return current;
      return [...current, url];
    });
  }

  function updatePlacement(url: string, patch: Partial<ImagePlacement>) {
    setPlacements((current) => {
      const next = { ...placementFor(current, url), ...patch };
      return { ...current, [url]: next };
    });
  }

  function resetPlacement(url: string) {
    setPlacements((current) => {
      if (!current[url]) return current;
      const next = { ...current };
      delete next[url];
      return next;
    });
  }

  useEffect(() => {
    if (!previewTemplateId || selectedUrls.length === 0) {
      const clearTimer = window.setTimeout(() => replacePreviewUrls([]), 0);
      return () => window.clearTimeout(clearTimer);
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      const data = buildPreviewData(
        previewPlaceholders,
        previewBindings,
        selectedImageValues,
      );

      void (async () => {
        const firstPage = await renderPreviewPage({
          templateId: previewTemplateId,
          page: 0,
          data,
          signal: controller.signal,
        });
        const rest = await Promise.all(
          Array.from({ length: firstPage.pageCount - 1 }, (_, index) =>
            renderPreviewPage({
              templateId: previewTemplateId,
              page: index + 1,
              data,
              signal: controller.signal,
            }),
          ),
        );
        replacePreviewUrls([firstPage.url, ...rest.map((page) => page.url)]);
      })()
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
  }, [
    previewTemplateId,
    previewPlaceholders,
    previewBindings,
    selectedUrls,
    selectedImageValues,
  ]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current = [];
    };
  }, []);

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
        body: JSON.stringify({ resumeToken, selectedImages: selectedImageValues }),
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
                className={cn(
                  effectiveActivePlacementUrl === image.url &&
                    "border-primary/70 ring-2 ring-primary/35",
                )}
              >
                <span className="absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-background/85 px-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
                  {index + 1}
                </span>
                <ToolButton
                  label="Frame image"
                  active={effectiveActivePlacementUrl === image.url}
                  disabled={submitting}
                  onClick={() => setActivePlacementUrl(image.url)}
                  className={cn(
                    "absolute bottom-2 left-2 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                    effectiveActivePlacementUrl === image.url && "opacity-100",
                  )}
                >
                  <Crosshair className="size-3" />
                </ToolButton>
              </ImageTile>
            ))}
          </div>
          {activePlacement ? (
            <PlacementControls
              image={byUrl.get(effectiveActivePlacementUrl)}
              placement={activePlacement}
              disabled={submitting}
              onPositionChange={(objectPosition) =>
                updatePlacement(effectiveActivePlacementUrl, { objectPosition })
              }
              onScaleChange={(scale) =>
                updatePlacement(effectiveActivePlacementUrl, { scale })
              }
              onReset={() => resetPlacement(effectiveActivePlacementUrl)}
              onMoveEarlier={() => move(effectiveActivePlacementUrl, -1)}
              onMoveLater={() => move(effectiveActivePlacementUrl, 1)}
              activeIndex={
                activePlacementIndex >= 0 ? activePlacementIndex : undefined
              }
              canMoveEarlier={activePlacementIndex > 0}
              canMoveLater={
                activePlacementIndex >= 0 &&
                activePlacementIndex < selectedImages.length - 1
              }
            />
          ) : null}
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
              {previewUrls.length > 1 ? (
                <div
                  role="tablist"
                  aria-label="Preview pages"
                  className="flex gap-1 border-b bg-card p-1"
                >
                  {previewUrls.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      role="tab"
                      aria-selected={activePreviewPage === index}
                      className={cn(
                        "h-6 rounded px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                        activePreviewPage === index &&
                          "bg-muted text-foreground",
                      )}
                      onClick={() => setActivePreviewPage(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
              {activePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePreviewUrl} alt="" className="w-full" />
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
