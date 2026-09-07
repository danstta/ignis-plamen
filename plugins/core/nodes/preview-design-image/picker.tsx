"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Crop,
  ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveTemplatePreview } from "@/components/render/live-template-preview";
import { imagePreviewSrc, imageThumbnailSrc } from "@/lib/nodes/image-preview";
import { PREVIEW_THUMBNAIL_SIZE } from "@/lib/render/preview-images";
import { normalizeImageCandidates } from "@/lib/nodes/image-input";
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
import {
  isPlaceholderImageValue,
  toListItems,
  type PlaceholderData,
  type PlaceholderDescriptor,
  type PlaceholderValue,
} from "@/lib/editor/types";
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

/** Accept http(s) links, protocol-relative URLs, and inline data-image URIs. */
function isLikelyImageUrl(url: string): boolean {
  return /^(https?:\/\/|\/\/|data:image\/)/i.test(url);
}

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
  selectedValue,
}: {
  placeholders: PreviewPlaceholder[];
  bindings: Record<string, unknown>;
  dynamicKey: string;
  selectedValue: PlaceholderValue;
}): PlaceholderData {
  const data: PlaceholderData = {};

  for (const placeholder of placeholders) {
    const bound = bindings[placeholder.key];
    data[placeholder.key] =
      placeholder.key === dynamicKey
        ? selectedValue
        : placeholder.kind === "list"
          ? toListItems(bound)
          : isPlaceholderImageValue(bound)
            ? bound
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

/** One selectable image tile. Removable tiles (custom URLs) drop the active-check
 *  badge — the ring already signals selection and the badge would collide with the
 *  remove button. */
function CandidateTile({
  candidate,
  index,
  active,
  disabled,
  framed,
  onSelect,
  onRemove,
}: {
  candidate: Candidate;
  index: number;
  active: boolean;
  disabled?: boolean;
  framed?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-md border bg-muted/25 transition",
        active
          ? "border-foreground/70 ring-2 ring-foreground/10"
          : "hover:border-foreground/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageThumbnailSrc(candidate, PREVIEW_THUMBNAIL_SIZE)}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover"
        />
        <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums shadow-sm">
          {index + 1}
        </span>
        {framed ? (
          <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
            <Crop className="size-3" />
            Framed
          </span>
        ) : null}
        {active && !onRemove ? (
          <span className="absolute right-2 top-2 rounded-full bg-foreground p-1 text-background shadow-sm">
            <Check className="size-3.5" />
          </span>
        ) : null}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {candidate.source ?? "Preview this image"}
        </span>
      </button>
      {onRemove ? (
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
      ) : null}
    </div>
  );
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
  const [customCandidates, setCustomCandidates] = useState<Candidate[]>([]);
  const [selectedUrl, setSelectedUrl] = useState(candidates[0]?.url ?? "");
  const [urlInput, setUrlInput] = useState("");
  const [placements, setPlacements] = useState<Record<string, ImagePlacement>>({});
  const [framingOpen, setFramingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allCandidates = useMemo(
    () => [...candidates, ...customCandidates],
    [candidates, customCandidates],
  );
  const selected = useMemo(
    () => allCandidates.find((candidate) => candidate.url === selectedUrl),
    [allCandidates, selectedUrl],
  );
  const groups = useMemo(() => candidateGroups(candidates), [candidates]);
  const grouped = groups.length > 1 || groups[0]?.key !== "ungrouped";

  const activePlacement = placements[selectedUrl] ?? DEFAULT_PLACEMENT;
  const activeObjectPosition = activePlacement.objectPosition;
  const activeScale = activePlacement.scale;

  function updatePlacement(url: string, patch: Partial<ImagePlacement>) {
    setPlacements((current) => ({
      ...current,
      [url]: { ...(current[url] ?? DEFAULT_PLACEMENT), ...patch },
    }));
  }

  function resetPlacement(url: string) {
    setPlacements((current) => {
      if (!current[url]) return current;
      const next = { ...current };
      delete next[url];
      return next;
    });
  }

  function addCustomUrl() {
    const raw = urlInput.trim();
    if (!raw) return;
    const [candidate] = normalizeImageCandidates([raw]);
    if (!candidate || !isLikelyImageUrl(candidate.url)) {
      toast.error("Enter a valid image URL (https://… or a Google Drive link)");
      return;
    }
    const url = candidate.url;
    setCustomCandidates((current) =>
      current.some((item) => item.url === url) ||
      candidates.some((item) => item.url === url)
        ? current
        : [...current, { ...candidate, source: "Your image" }],
    );
    setSelectedUrl(url);
    setUrlInput("");
  }

  function removeCustom(url: string) {
    setCustomCandidates((current) => current.filter((item) => item.url !== url));
    resetPlacement(url);
    setSelectedUrl((current) =>
      current === url ? (candidates[0]?.url ?? "") : current,
    );
  }

  const previewData = useMemo(
    () => buildPreviewData({
      placeholders: previewPlaceholders,
      bindings: previewBindings,
      dynamicKey: dynamicImagePlaceholderKey,
      selectedValue: placementToPlaceholderValue(selectedUrl, {
        objectPosition: activeObjectPosition,
        scale: activeScale,
      }),
    }),
    [previewPlaceholders, previewBindings, dynamicImagePlaceholderKey,
      selectedUrl, activeObjectPosition, activeScale],
  );

  async function lockImage() {
    if (!selectedUrl) {
      toast.error("Choose an image before locking the preview");
      return;
    }

    const placement = placements[selectedUrl] ?? DEFAULT_PLACEMENT;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken,
          url: selectedUrl,
          ...(hasCustomPlacement(placement)
            ? {
                objectPosition: placement.objectPosition,
                scale: placement.scale,
              }
            : {}),
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success("Image locked - finishing run");
      router.refresh();
    } catch (err) {
      toast.error("Failed to lock image", { description: String(err) });
      setSubmitting(false);
    }
  }

  const tilesFor = (group: CandidateGroup) =>
    group.candidates.map(({ candidate, index }) => (
      <CandidateTile
        key={candidate.url}
        candidate={candidate}
        index={index}
        active={candidate.url === selectedUrl}
        disabled={submitting}
        framed={hasCustomPlacement(placements[candidate.url] ?? DEFAULT_PLACEMENT)}
        onSelect={() => setSelectedUrl(candidate.url)}
      />
    ));

  return (
    <PickerLayout
      toolbar={
        <PickerToolbar
          status={
            <span className="tabular-nums">
              {candidates.length} image{candidates.length === 1 ? "" : "s"}
              {customCandidates.length > 0
                ? ` · ${customCandidates.length} added`
                : ""}
            </span>
          }
        >
          <Button
            type="button"
            size="sm"
            variant={framingOpen ? "secondary" : "outline"}
            onClick={() => setFramingOpen((open) => !open)}
            disabled={submitting || !selectedUrl}
            aria-pressed={framingOpen}
          >
            <Crop className="size-4" />
            Adjust
          </Button>
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
        </PickerToolbar>
      }
      aside={
        <>
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
          <LiveTemplatePreview
            templateId={previewTemplateId}
            data={previewData}
            images={allCandidates}
          />
        </>
      }
    >
      {framingOpen && selectedUrl ? (
        <ImageFramingControls
          previewSrc={selected ? imagePreviewSrc(selected) : undefined}
          placement={activePlacement}
          disabled={submitting}
          onPositionChange={(objectPosition) =>
            updatePlacement(selectedUrl, { objectPosition })
          }
          onScaleChange={(scale) => updatePlacement(selectedUrl, { scale })}
          header={
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Crop &amp; zoom
              </span>
              <div className="flex items-center gap-1">
                <ToolButton
                  label="Reset framing"
                  disabled={submitting || !hasCustomPlacement(activePlacement)}
                  onClick={() => resetPlacement(selectedUrl)}
                >
                  <RotateCcw className="size-3" />
                </ToolButton>
                <ToolButton
                  label="Close framing"
                  disabled={submitting}
                  onClick={() => setFramingOpen(false)}
                >
                  <X className="size-3" />
                </ToolButton>
              </div>
            </div>
          }
        />
      ) : null}

      {groups.map((group) =>
        grouped ? (
          <PickerSection
            key={group.key}
            title={group.label}
            meta={group.candidates.length}
          >
            <TileGrid>{tilesFor(group)}</TileGrid>
          </PickerSection>
        ) : (
          <TileGrid key={group.key}>{tilesFor(group)}</TileGrid>
        ),
      )}

      {/* Last, because it is the fallback for when none of the candidates fit —
          and the tiles it adds land directly under the field that added them. */}
      <PickerSection
        title="Your images"
        meta={customCandidates.length > 0 ? customCandidates.length : undefined}
      >
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomUrl();
              }
            }}
            placeholder="Paste an image link"
            disabled={submitting}
            className="h-8"
            aria-label="Image URL"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addCustomUrl}
            disabled={submitting || !urlInput.trim()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {customCandidates.length > 0 ? (
          <TileGrid className="mt-3">
            {customCandidates.map((candidate, index) => (
              <CandidateTile
                key={candidate.url}
                candidate={candidate}
                index={candidates.length + index}
                active={candidate.url === selectedUrl}
                disabled={submitting}
                framed={hasCustomPlacement(
                  placements[candidate.url] ?? DEFAULT_PLACEMENT,
                )}
                onSelect={() => setSelectedUrl(candidate.url)}
                onRemove={() => removeCustom(candidate.url)}
              />
            ))}
          </TileGrid>
        ) : null}
      </PickerSection>
    </PickerLayout>
  );
}
