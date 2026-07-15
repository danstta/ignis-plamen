import {
  ArrowLeft,
  Braces,
  Shapes as ShapesIcon,
  Images,
  Undo2,
  Redo2,
  Download,
  Save,
  Plus,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Static, non-interactive mockup of the Ignis design editor. Recreates the
 * layout (floating toolbar, canvas, properties panel, page strip, zoom controls)
 * purely for visual showcase on the landing page. No buttons do anything.
 */

function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  hasCaret,
}: {
  icon: React.ReactNode;
  label?: string;
  active?: boolean;
  hasCaret?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground",
      )}
    >
      {icon}
      {label ? <span>{label}</span> : null}
      {hasCaret ? <span className="text-muted-foreground/60">⌄</span> : null}
    </div>
  );
}

function IconBtn({
  icon,
  disabled,
}: {
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-lg",
        disabled
          ? "text-muted-foreground/30"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function FakeInput({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-xs",
        mono && "font-mono",
      )}
    >
      <span className="truncate text-foreground">{value}</span>
    </div>
  );
}

function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs">
      <span className="truncate">{value}</span>
      <span className="text-muted-foreground/60">⌄</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function PosterDesign() {
  return (
    <div
      className="relative overflow-hidden rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_10px_40px_rgba(0,0,0,0.12)]"
      style={{ width: 220, height: 275 }}
    >
      {/* Background image (gradient stands in for a photo) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, #1a2a6c 0%, #b21f1f 50%, #fdbb2d 100%)",
        }}
      />
      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Logo circle (top-left) */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <div className="size-5 rounded-full bg-white/90" />
        <span className="text-[9px] font-semibold text-white/90">BRAND</span>
      </div>

      {/* Title — with selection handles to look "selected" */}
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          {/* Selection box */}
          <div className="absolute -inset-1.5 border border-blue-500" />
          {/* Handles */}
          <span className="absolute -left-1.5 -top-1.5 size-1.5 border border-blue-500 bg-white" />
          <span className="absolute -right-1.5 -top-1.5 size-1.5 border border-blue-500 bg-white" />
          <span className="absolute -bottom-1.5 -left-1.5 size-1.5 border border-blue-500 bg-white" />
          <span className="absolute -right-1.5 -bottom-1.5 size-1.5 border border-blue-500 bg-white" />
          <div className="px-3 text-center">
            <p className="text-lg font-bold leading-tight text-white">Big</p>
            <p className="text-lg font-bold leading-tight text-white">Ideas</p>
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-[8px] font-medium uppercase tracking-widest text-white/80">
          Brand Template
        </p>
        <p className="text-[8px] text-white/60">v1.0</p>
      </div>
    </div>
  );
}

function PageThumb({ active }: { active?: boolean }) {
  return (
    <div
      className={cn(
        "h-14 shrink-0 rounded-md border bg-muted",
        active
          ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
          : "border-border",
      )}
      style={{ aspectRatio: "220 / 275" }}
    >
      {active ? (
        <div className="h-full w-full rounded-md bg-gradient-to-br from-blue-900 via-red-700 to-amber-400" />
      ) : (
        <div className="h-full w-full rounded-md bg-gradient-to-br from-slate-700 via-slate-600 to-slate-400" />
      )}
    </div>
  );
}

export function EditorMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/20">
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5">
        <TrafficLights />
        <span className="text-xs font-medium text-muted-foreground">
          Ignis — Design Editor
        </span>
      </div>

      {/* Editor body */}
      <div className="flex h-[420px]">
        {/* Canvas + toolbar + page strip */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-muted/40">
            {/* Floating toolbar */}
            <div className="absolute left-3 right-3 top-3 z-20 flex justify-center">
              <div className="flex max-w-full items-center gap-0.5 overflow-hidden rounded-full border border-border bg-background/90 p-1 shadow-sm shadow-black/10 backdrop-blur">
                <IconBtn icon={<ArrowLeft className="size-4" />} />
                <div className="mx-0.5 h-5 w-px bg-border" />
                <ToolbarButton icon={<ShapesIcon className="size-4" />} label="Shapes" hasCaret />
                <ToolbarButton icon={<Plus className="size-4" />} label="Elements" hasCaret />
                <ToolbarButton icon={<Braces className="size-4" />} label="Placeholders" hasCaret />
                <ToolbarButton icon={<Images className="size-4" />} label="Assets" />
                <div className="mx-0.5 h-5 w-px bg-border" />
                <IconBtn icon={<Undo2 className="size-4" />} />
                <IconBtn icon={<Redo2 className="size-4" />} disabled />
              </div>
            </div>

            {/* Canvas viewport */}
            <div className="flex h-full items-center justify-center p-6">
              <PosterDesign />
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
              <IconBtn icon={<span className="text-xs">−</span>} />
              <span className="w-10 text-center text-xs tabular-nums">100%</span>
              <IconBtn icon={<span className="text-xs">+</span>} />
            </div>
          </div>

          {/* Page strip */}
          <div className="flex h-20 shrink-0 items-center gap-2 border-t border-border bg-background px-3">
            <PageThumb active />
            <PageThumb />
            <PageThumb />
            <div
              className="flex h-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-3 text-muted-foreground"
              style={{ aspectRatio: "220 / 275" }}
            >
              <Plus className="size-4" />
            </div>
          </div>
        </div>

        {/* Properties panel */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-border bg-background">
          {/* Panel header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
            <FakeInput value="Big Ideas" />
            <div className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground">
              <Download className="size-3.5" />
            </div>
            <div className="flex size-7 items-center justify-center rounded-md border border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-600">
              <Save className="size-3.5" />
            </div>
          </div>

          {/* Properties content */}
          <div className="scrollbar-thin-muted min-h-0 flex-1 overflow-hidden p-3">
            <div className="flex flex-col gap-3">
              <SectionTitle>text</SectionTitle>

              <Field label="Placeholder key (leave empty for fixed text)">
                <FakeInput value="title" mono />
              </Field>

              <Field label="Text">
                <div className="rounded-md border border-border bg-background p-2 text-xs">
                  Big Ideas
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Font">
                  <FakeSelect value="Geist" />
                </Field>
                <Field label="Size">
                  <FakeInput value="48" mono />
                </Field>
                <Field label="Weight">
                  <FakeSelect value="700" />
                </Field>
                <Field label="Line height">
                  <FakeInput value="1.1" mono />
                </Field>
              </div>

              <Field label="Align">
                <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                  <div className="flex flex-1 items-center justify-center rounded bg-background py-1.5 shadow-sm">
                    <AlignLeft className="size-3.5" />
                  </div>
                  <div className="flex flex-1 items-center justify-center py-1.5 text-muted-foreground">
                    <AlignCenter className="size-3.5" />
                  </div>
                  <div className="flex flex-1 items-center justify-center py-1.5 text-muted-foreground">
                    <AlignRight className="size-3.5" />
                  </div>
                </div>
              </Field>

              <Field label="Color">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded border border-border bg-white" />
                  <FakeInput value="#ffffff" mono />
                </div>
              </Field>

              <div className="h-px bg-border" />

              <SectionTitle>Box</SectionTitle>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Auto width (hug text)</span>
                <div className="flex h-4 w-7 items-center rounded-full bg-muted p-0.5">
                  <div className="size-3 rounded-full bg-muted-foreground" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Fit to box (auto size)</span>
                <div className="flex h-4 w-7 items-center rounded-full bg-foreground p-0.5">
                  <div className="ml-auto size-3 rounded-full bg-background" />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
