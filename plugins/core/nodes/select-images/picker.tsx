"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  GripVertical,
  MoveDown,
  MoveUp,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LiveTemplatePreview } from "@/components/render/live-template-preview";
import { PREVIEW_THUMBNAIL_SIZE } from "@/lib/render/preview-images";
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
import {
  DEFAULT_PLACEMENT,
  hasCustomPlacement,
  ImageFramingControls,
  placementToPlaceholderValue,
  ToolButton,
  type ImagePlacement,
} from "@/lib/nodes/image-framing";
import {
  PickerLayout,
  PickerSection,
  PickerToolbar,
  TileGrid,
} from "@/lib/nodes/picker-layout";
import { cn } from "@/lib/utils";

type Candidate = {
  url: string;
  attribution?: string;
  previewUrl?: string;
  thumbnailLink?: string;
  mimeType?: string;
  name?: string;
  folderId?: string;
  folderName?: string;
  category?: string;
  categoryReason?: string;
  categorized?: boolean;
};
type PreviewPlaceholder = PlaceholderDescriptor;
type SelectedImageValue = { url: string } & ImagePlacement;

/**
 * Alternates are paged so at most this many tiles are mounted at once. Fifteen
 * fills three rows of the shared tile grid at the width the run page gives the
 * picker, and covers the node's default alternate count in a single page.
 */
const ALTERNATES_PAGE_SIZE = 15;
/** Alternate pages warmed ahead of the current one so paging never waits on loads. */
const ALTERNATES_PRELOAD_PAGES = 2;

function uniqueByUrl(images: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

type FolderOption = { id: string; name: string; count: number };

/**
 * Folder chips for the alternates filter. The list comes from every image so
 * the row never reflows as you select, while each count reflects only the
 * images still available to add. An empty result means no image carries a
 * folder at all, which the picker reports rather than hiding.
 */
function folderOptions(
  all: Candidate[],
  unselected: Candidate[],
): FolderOption[] {
  const remaining = new Map<string, number>();
  for (const image of unselected) {
    if (!image.folderId) continue;
    remaining.set(image.folderId, (remaining.get(image.folderId) ?? 0) + 1);
  }

  const options: FolderOption[] = [];
  const seen = new Set<string>();
  for (const image of all) {
    const id = image.folderId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      name: image.folderName?.trim() || id,
      count: remaining.get(id) ?? 0,
    });
  }

  return options;
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
  return image ? placementToPlaceholderValue(image.url, image) : "";
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
  // Tiles fade in over a filled box instead of popping out of an empty
  // (near-black in dark mode) one while the thumbnail downloads.
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("aspect-square w-full", !loaded && "bg-muted/60")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageThumbnailSrc(image, PREVIEW_THUMBNAIL_SIZE)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        ref={(img) => {
          // Cached images can complete before onLoad is attached.
          if (img?.complete) setLoaded(true);
        }}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
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

/** The whole tile adds the image — the section copy tells you to click images. */
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
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      aria-label={image.name ? `Add ${image.name}` : "Add image"}
      className="group relative block overflow-hidden rounded-md border bg-muted/20 text-left outline-none transition-colors hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      <TileImage image={image} />
      <CategoryBadge image={image} />
      <span className="pointer-events-none absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Plus className="size-4" />
      </span>
    </button>
  );
}

function FolderChip({
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="max-w-[14rem] font-normal"
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </Button>
  );
}

/**
 * Folder filter for the alternates. Sits directly above the grid it filters,
 * with "All" first so the unfiltered pool is always one click away. Counts are
 * the images still available to add, so a folder that reads 0 is exhausted.
 */
function FolderFilterBar({
  folders,
  activeFolderId,
  totalCount,
  disabled,
  onSelect,
}: {
  folders: FolderOption[];
  activeFolderId: string;
  totalCount: number;
  disabled?: boolean;
  onSelect: (folderId: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <FolderChip
        label="All"
        count={totalCount}
        active={!activeFolderId}
        disabled={disabled}
        onClick={() => onSelect("")}
      />
      {folders.map((folder) => (
        <FolderChip
          key={folder.id}
          label={folder.name}
          count={folder.count}
          active={activeFolderId === folder.id}
          disabled={disabled || folder.count === 0}
          onClick={() => onSelect(folder.id)}
        />
      ))}
    </div>
  );
}

/** Compact page stepper, sized to sit in the alternates section heading. */
function AlternatesPager({
  page,
  pageCount,
  disabled,
  onChange,
}: {
  page: number;
  pageCount: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Previous page"
        disabled={disabled || page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="size-3" />
      </Button>
      <span className="min-w-12 text-center text-[11px] tabular-nums text-muted-foreground">
        {page + 1} / {pageCount}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Next page"
        disabled={disabled || page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="size-3" />
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
    <div className="mt-3">
      <ImageFramingControls
        previewSrc={image ? imagePreviewSrc(image) : undefined}
        placement={placement}
        disabled={disabled}
        onPositionChange={onPositionChange}
        onScaleChange={onScaleChange}
        header={
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
              <ToolButton
                label="Close framing"
                disabled={disabled}
                onClick={onClose}
              >
                <X className="size-3" />
              </ToolButton>
            </div>
          </div>
        }
      />
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
  groupByFolder = false,
  previewTemplateId,
  previewPlaceholders = [],
  previewBindings = {},
}: {
  runId: string;
  resumeToken: string;
  selected: Candidate[];
  alternates: Candidate[];
  selectionCount: number;
  /** Enables the folder filter above the alternates (Select Images config). */
  groupByFolder?: boolean;
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
  const [folderFilter, setFolderFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const preloadedThumbnailsRef = useRef(new Set<string>());

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
  const unselectedImages = allImages.filter(
    (image) => !selectedUrls.includes(image.url),
  );
  const folders = groupByFolder
    ? folderOptions(allImages, unselectedImages)
    : [];
  // Folders can vanish between renders (all their images got selected), so
  // never trust the stored filter without checking it still exists.
  const showFolders = folders.length > 1;
  const activeFolderId =
    showFolders && folders.some((folder) => folder.id === folderFilter)
      ? folderFilter
      : "";
  const alternateImages = activeFolderId
    ? unselectedImages.filter((image) => image.folderId === activeFolderId)
    : unselectedImages;
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
  const previewData = useMemo(
    () => buildPreviewData(previewPlaceholders, previewBindings, selectedImageValues),
    [previewPlaceholders, previewBindings, selectedImageValues],
  );

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

  // Paging is per-folder, so a new filter always starts at its first page.
  function selectFolder(folderId: string) {
    setFolderFilter(folderId);
    setAlternatePage(0);
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

  // Warm the thumbnails around the current alternates page (ahead and one page
  // back) so Next/Previous swap in already-cached images instead of loading.
  useEffect(() => {
    const aheadEnd =
      alternatePageStart + ALTERNATES_PAGE_SIZE * (1 + ALTERNATES_PRELOAD_PAGES);
    const behindStart = Math.max(0, alternatePageStart - ALTERNATES_PAGE_SIZE);
    const toWarm = [
      ...alternateImages.slice(alternatePageStart + ALTERNATES_PAGE_SIZE, aheadEnd),
      ...alternateImages.slice(behindStart, alternatePageStart),
    ];
    for (const image of toWarm) {
      const src = imageThumbnailSrc(image, PREVIEW_THUMBNAIL_SIZE);
      if (preloadedThumbnailsRef.current.has(src)) continue;
      preloadedThumbnailsRef.current.add(src);
      const preload = new Image();
      preload.decoding = "async";
      preload.src = src;
    }
  }, [alternateImages, alternatePageStart]);

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

  const selectedHint =
    selectedImages.length === 0
      ? "Click images below to fill the slots"
      : selectedImages.length > 1
        ? "Drag to reorder"
        : undefined;

  return (
    <PickerLayout
      toolbar={
        <PickerToolbar
          status={
            <span className="tabular-nums">
              {selectedImages.length} of {selectionCount} selected
            </span>
          }
        >
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={submitting || selectedImages.length === 0}
          >
            <Check className="size-4" />
            Continue
          </Button>
        </PickerToolbar>
      }
      aside={
        previewTemplateId ? (
          <>
            <h3 className="text-xs font-medium text-muted-foreground">
              Template preview
            </h3>
            <LiveTemplatePreview
              templateId={previewTemplateId}
              data={previewData}
              images={allImages}
            />
          </>
        ) : undefined
      }
    >
      <PickerSection title="Selected" meta={selectedHint}>
        <TileGrid>
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
        </TileGrid>
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
      </PickerSection>

      <PickerSection
        title="Alternates"
        meta={
          alternateImages.length > 0
            ? `${alternatePageStart + 1}-${alternatePageStart + shownAlternates.length} of ${alternateImages.length}`
            : undefined
        }
        actions={
          alternatePageCount > 1 ? (
            <AlternatesPager
              page={currentAlternatePage}
              pageCount={alternatePageCount}
              disabled={submitting}
              onChange={setAlternatePage}
            />
          ) : null
        }
      >
        {groupByFolder && folders.length === 0 ? (
          <p className="mb-3 text-[11px] text-muted-foreground">
            Folder grouping is on, but these images carry no source folder.
            Connect this node to the Drive node&apos;s Images output, not Image
            links, and start a new run.
          </p>
        ) : null}

        {showFolders ? (
          <FolderFilterBar
            folders={folders}
            activeFolderId={activeFolderId}
            totalCount={unselectedImages.length}
            disabled={submitting}
            onSelect={selectFolder}
          />
        ) : null}

        {alternateImages.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            {activeFolderId
              ? "Every image in this folder is already selected."
              : "No more images to add."}
          </p>
        ) : (
          <TileGrid>
            {shownAlternates.map((image) => (
              <AlternateTile
                key={image.url}
                image={image}
                disabled={submitting || atSelectionLimit}
                onAdd={() => add(image.url)}
              />
            ))}
          </TileGrid>
        )}
      </PickerSection>
    </PickerLayout>
  );
}
