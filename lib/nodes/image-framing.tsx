"use client";

import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ImagePlacement } from "./image-placement";

/**
 * Shared image "framing" (crop/pan/zoom) controls for the run-review pickers.
 * The placement vocabulary itself (types + collapse helpers) lives in the
 * React-free `./image-placement`; this file owns the UI and re-exports those so
 * every picker (select-images, preview-design-image) frames images identically.
 */
export {
  DEFAULT_PLACEMENT,
  hasCustomPlacement,
  placementToPlaceholderValue,
  type ImagePlacement,
} from "./image-placement";

/** The nine keyword `objectPosition` presets the render path can reproduce. */
export const POSITION_PRESETS = [
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

export function ToolButton({
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

/**
 * The reusable framing body: a live crop thumbnail, the 3x3 position grid, and a
 * zoom slider. Callers own the surrounding chrome (reorder/close buttons, section
 * heading) and pass it via {@link header}; it renders above the controls in the
 * right-hand column so each picker keeps its own layout.
 */
export function ImageFramingControls({
  previewSrc,
  placement,
  disabled,
  header,
  onPositionChange,
  onScaleChange,
}: {
  previewSrc?: string;
  placement: ImagePlacement;
  disabled?: boolean;
  header?: ReactNode;
  onPositionChange: (objectPosition: string) => void;
  onScaleChange: (scale: number) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
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
        {header}

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
            <span className="tabular-nums">
              {Math.round(placement.scale * 100)}%
            </span>
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
