"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  Crosshair,
  GripVertical,
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
  toListItems,
  type PlaceholderData,
  type PlaceholderDescriptor,
  type PlaceholderValue,
} from "@/lib/editor/types";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";
import { imagePreviewSrc, imageThumbnailSrc } from "@/lib/nodes/image-preview";
import { cn } from "@/lib/utils";

type Candidate = {
  url: string;
  attribution?: string;
  previewUrl?: string;
  thumbnailLink?: string;
  mimeType?: string;
  name?: string;
  category?: string;
  categoryReason?: string;
  categorized?: boolean;
};
type PreviewPlaceholder = PlaceholderDescriptor;
type ImagePlacement = { objectPosition: string; scale: number };
type SelectedImageValue = { url: string } & ImagePlacement;

const DEFAULT_PLACEMENT: ImagePlacement = {
  objectPosition: "center center",
  scale: 1,
};

/** Alternates are paged so at most this many tiles are mounted at once (2 rows of 3). */
const ALTERNATES_PAGE_SIZE = 6;
/** Pixel size requested from Google's CDN thumbnail for grid tiles. */
const TILE_THUMBNAIL_SIZE = 400;

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

/** Move `fromUrl` to sit where `toUrl` currently is, preserving the rest of the order. */
function reorderUrls(
  urls: string[],
  fromUrl: string,
  toUrl: string,
): string[] {
  const from = urls.indexOf(fromUrl);
  const to = urls.indexOf(toUrl);
  if (from < 0 || to < 0 || from === to) return urls;
  const next = [...urls];
  next.splice(from, 1);
  next.splice(to, 0, fromUrl);
  return next;
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

function TileImage({ image }: { image: Candidate }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageThumbnailSrc(image, TILE_THUMBNAIL_SIZE)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="aspect-square w-full object-cover"
    />
  );
}

function CategoryBadge({ image }: { image: Candidate }) {
  const category = image.category?.trim();
  if (!category) return null;

  return (
    <span
      title={
        image.categoryReason
          ? `${category}: ${image.categoryReason}`
          : category
      }
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur",
        image.categorized === false &&
          "border border-destructive/35 text-destructive",
      )}
    >
      {category}
    </span>
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

function SelectedTile({
  image,
  index,
  active,
  dragging,
  dropTarget,
  disabled,
  onRemove,
  onFrame,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  image: Candidate;
  index: number;
  active: boolean;
  dragging: boolean;
  dropTarget: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onFrame: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox requires data to be set for a drag to start.
        event.dataTransfer.setData("text/plain", image.url);
        onDragStart();
      }}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={onDragEnter}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative overflow-hidden rounded-md border bg-muted/20 transition",
        !disabled && "cursor-grab active:cursor-grabbing",
        active && "border-primary/70 ring-2 ring-primary/35",
        dropTarget && !dragging && "ring-2 ring-primary",
        dragging && "opacity-40",
      )}
    >
      <TileImage image={image} />
      <CategoryBadge image={image} />

      <span className="pointer-events-none absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-background/85 px-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
        {index + 1}
      </span>

      <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center py-1 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="size-4 text-white drop-shadow" />
      </span>

      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove"
        className="absolute right-2 top-2 opacity-[0.85] shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <X className="size-4" />
      </Button>

      <ToolButton
        label="Frame image"
        active={active}
        disabled={disabled}
        onClick={onFrame}
        className={cn(
          "absolute bottom-2 right-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          active && "opacity-100",
        )}
      >
        <Crop className="size-3" />
      </ToolButton>
    </div>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted/10 text-sm font-medium text-muted-foreground/50">
      {index + 1}
    </div>
  );
}

function AlternateTile({
  image,
  disabled,
  onAdd,
}: {
  image: Candidate;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted/20">
      <TileImage image={image} />
      <CategoryBadge image={image} />
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        onClick={onAdd}
        disabled={disabled}
        aria-label="Add"
        className="absolute right-2 top-2 opacity-[0.85] shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function FramingPanel({
  image,
  placement,
  disabled,
  activeIndex,
  canMoveEarlier,
  canMoveLater,
  onPositionChange,
  onScaleChange,
  onReset,
  onMoveEarlier,
  onMoveLater,
  onClose,
}: {
  image?: Candidate;
  placement: ImagePlacement;
  disabled?: boolean;
  activeIndex?: number;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onPositionChange: (objectPosition: string) => void;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePreviewSrc(image)}
            alt=""
            loading="lazy"
            decoding="async"
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
              Framing
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
            <ToolButton label="Close framing" disabled={disabled} onClick={onClose}>
              <X className="size-3" />
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
    } else if (placeholder.kind === "list") {
      data[placeholder.key] = toListItems(bound);
    } else {
      data[placeholder.key] = valueForTextPlaceholder(bound);
    }
  }

  return data;
}

export function SelectImagesPicker({
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
  // Selection starts empty on purpose: every slot is a blank the user fills by
  // clicking images below, rather than unpicking a server-made preselection.
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, ImagePlacement>>(
    {},
  );
  const [framingUrl, setFramingUrl] = useState("");
  const [draggingUrl, setDraggingUrl] = useState("");
  const [dragOverUrl, setDragOverUrl] = useState("");
  const [alternatePage, setAlternatePage] = useState(0);
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
  const alternatePageCount = Math.ceil(
    alternateImages.length / ALTERNATES_PAGE_SIZE,
  );
  // Adding/removing images resizes the pool, so clamp instead of trusting state.
  const currentAlternatePage = Math.min(
    alternatePage,
    Math.max(0, alternatePageCount - 1),
  );
  const alternatePageStart = currentAlternatePage * ALTERNATES_PAGE_SIZE;
  const shownAlternates = alternateImages.slice(
    alternatePageStart,
    alternatePageStart + ALTERNATES_PAGE_SIZE,
  );
  const atSelectionLimit = selectedUrls.length >= selectionCount;

  const effectiveFramingUrl = selectedUrls.includes(framingUrl) ? framingUrl : "";
  const activePlacement = effectiveFramingUrl
    ? placementFor(placements, effectiveFramingUrl)
    : null;
  const framingIndex = selectedUrls.indexOf(effectiveFramingUrl);
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
    if (framingUrl === url) setFramingUrl("");
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

  function handleDrop(targetUrl: string) {
    if (draggingUrl && draggingUrl !== targetUrl) {
      setSelectedUrls((current) => reorderUrls(current, draggingUrl, targetUrl));
    }
    setDraggingUrl("");
    setDragOverUrl("");
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
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Selected
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {selectedImages.length === 0
                ? "Click images below to fill the slots"
                : selectedImages.length > 1
                  ? "Drag to reorder"
                  : null}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: selectionCount }, (_, index) => {
              const image = selectedImages[index];
              if (!image) return <EmptySlot key={`slot-${index}`} index={index} />;
              return (
                <SelectedTile
                  key={image.url}
                  image={image}
                  index={index}
                  active={effectiveFramingUrl === image.url}
                  dragging={draggingUrl === image.url}
                  dropTarget={
                    dragOverUrl === image.url && draggingUrl !== image.url
                  }
                  disabled={submitting}
                  onRemove={() => remove(image.url)}
                  onFrame={() =>
                    setFramingUrl((current) =>
                      current === image.url ? "" : image.url,
                    )
                  }
                  onDragStart={() => {
                    setDraggingUrl(image.url);
                    setDragOverUrl(image.url);
                  }}
                  onDragEnter={() => setDragOverUrl(image.url)}
                  onDrop={() => handleDrop(image.url)}
                  onDragEnd={() => {
                    setDraggingUrl("");
                    setDragOverUrl("");
                  }}
                />
              );
            })}
          </div>
          {activePlacement ? (
            <FramingPanel
              image={byUrl.get(effectiveFramingUrl)}
              placement={activePlacement}
              disabled={submitting}
              activeIndex={framingIndex >= 0 ? framingIndex : undefined}
              canMoveEarlier={framingIndex > 0}
              canMoveLater={
                framingIndex >= 0 && framingIndex < selectedImages.length - 1
              }
              onPositionChange={(objectPosition) =>
                updatePlacement(effectiveFramingUrl, { objectPosition })
              }
              onScaleChange={(scale) =>
                updatePlacement(effectiveFramingUrl, { scale })
              }
              onReset={() => resetPlacement(effectiveFramingUrl)}
              onMoveEarlier={() => move(effectiveFramingUrl, -1)}
              onMoveLater={() => move(effectiveFramingUrl, 1)}
              onClose={() => setFramingUrl("")}
            />
          ) : null}
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Alternates
            </h3>
            {alternateImages.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {alternatePageStart + 1}-
                {alternatePageStart + shownAlternates.length} of{" "}
                {alternateImages.length}
              </span>
            ) : null}
          </div>
          {alternateImages.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              No more images to add.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {shownAlternates.map((image) => (
                  <AlternateTile
                    key={image.url}
                    image={image}
                    disabled={submitting || atSelectionLimit}
                    onAdd={() => add(image.url)}
                  />
                ))}
              </div>
              {alternatePageCount > 1 ? (
                <div className="mt-3 flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentAlternatePage === 0}
                    onClick={() =>
                      setAlternatePage(Math.max(0, currentAlternatePage - 1))
                    }
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    Page {currentAlternatePage + 1} of {alternatePageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentAlternatePage >= alternatePageCount - 1}
                    onClick={() =>
                      setAlternatePage(
                        Math.min(alternatePageCount - 1, currentAlternatePage + 1),
                      )
                    }
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
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
