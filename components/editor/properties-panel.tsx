"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Bold,
  Copy,
  Trash2,
  BringToFront,
  SendToBack,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
} from "lucide-react";
import { activeBrand, currentPage, useEditor } from "@/lib/editor/store";
import type { BrandColor, BrandFont } from "@/lib/brand/types";
import {
  CANVAS_PRESETS,
  type CanvasPreset,
  type BorderStyle,
  type Fill,
  type Gradient,
  type GradientStop,
  type ImageElement,
  type ShapeElement,
  type TemplateElement,
  type TextElement,
  isGradient,
  toGradient,
  toSolid,
} from "@/lib/editor/types";
import { isPolygonShape } from "@/lib/editor/shapes";
import { fillToStyle } from "@/lib/render/element-style";
import { FIT_MAX_FONT_SIZE, FIT_MIN_FONT_SIZE } from "@/lib/render/fit-text";
import { FONT_FAMILIES, FONTS } from "@/lib/render/font-registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Fonts the renderer can actually embed, so editor preview matches the PNG.
// Driven by the shared registry (lib/render/font-registry.ts) — add fonts there.
// Brand fonts are merged in on top of this base (see TextProps).
const BASE_FONTS = FONT_FAMILIES;
const FONT_WEIGHT_OPTIONS = [300, 400, 500, 600, 700, 800, 900] as const;
const NORMAL_FONT_WEIGHT = 400;
const BOLD_FONT_WEIGHT = 700;

// Stable empty references so brand selectors don't return a fresh array each render.
const NO_COLORS: BrandColor[] = [];
const NO_FONTS: BrandFont[] = [];

function cssFontFamily(family: string) {
  return `"${family.replaceAll('"', '\\"')}", sans-serif`;
}

function isBoldWeight(weight: number | undefined) {
  return (weight ?? NORMAL_FONT_WEIGHT) >= BOLD_FONT_WEIGHT;
}

function snapshot() {
  useEditor.getState().pushHistory();
}

/** Clickable swatches for the active brand's colors. Renders nothing without a brand. */
function BrandSwatches({ onPick }: { onPick: (color: string) => void }) {
  const colors = useEditor((s) => activeBrand(s)?.colors ?? NO_COLORS);
  if (colors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            snapshot();
            onPick(c.value);
          }}
          className="size-5 cursor-pointer rounded-full border transition-transform hover:scale-110"
          style={{ backgroundColor: c.value }}
          title={c.name || c.value}
          aria-label={`Brand color ${c.name || c.value}`}
        />
      ))}
    </div>
  );
}

/** Number input that tolerates partial typing and syncs when value changes externally. */
function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(String(value));
    }
  }, [value]);
  return (
    <Input
      type="number"
      step={step}
      value={text}
      className="h-8"
      onFocus={snapshot}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) {
          last.current = n;
          onChange(n);
        }
      }}
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onFocus={snapshot}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded border bg-transparent"
          aria-label="Color"
        />
        <Input
          value={value}
          className="h-8"
          onFocus={snapshot}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <BrandSwatches onPick={onChange} />
    </div>
  );
}

/** Solid color or gradient picker. Drives canvas background and shape fill. */
function FillInput({
  value,
  onChange,
}: {
  value: Fill;
  onChange: (f: Fill) => void;
}) {
  const gradient = isGradient(value) ? value : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1">
        <Button
          type="button"
          variant={gradient ? "outline" : "secondary"}
          size="sm"
          onClick={() => {
            if (!gradient) return;
            snapshot();
            onChange(toSolid(value));
          }}
        >
          Solid
        </Button>
        <Button
          type="button"
          variant={gradient ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            if (gradient) return;
            snapshot();
            onChange(toGradient(value));
          }}
        >
          Gradient
        </Button>
      </div>
      {gradient ? (
        <GradientEditor gradient={gradient} onChange={onChange} />
      ) : (
        <ColorInput value={toSolid(value)} onChange={onChange} />
      )}
    </div>
  );
}

function GradientEditor({
  gradient,
  onChange,
}: {
  gradient: Gradient;
  onChange: (g: Gradient) => void;
}) {
  const update = (patch: Partial<Gradient>) => onChange({ ...gradient, ...patch });
  const updateStop = (i: number, patch: Partial<GradientStop>) =>
    update({
      stops: gradient.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  const addStop = () => {
    snapshot();
    const last = gradient.stops[gradient.stops.length - 1];
    update({
      stops: [...gradient.stops, { color: last?.color ?? "#000000", offset: 100 }],
    });
  };
  const removeStop = (i: number) => {
    if (gradient.stops.length <= 2) return;
    snapshot();
    update({ stops: gradient.stops.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select
            value={gradient.type}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update({ type: v as Gradient["type"] });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {gradient.type === "linear" ? (
          <Field label="Angle">
            <NumberInput
              value={gradient.angle ?? 180}
              onChange={(angle) => update({ angle })}
            />
          </Field>
        ) : null}
      </div>

      <div className="h-6 w-full rounded border" style={fillToStyle(gradient)} />

      <div className="flex flex-col gap-1.5">
        {gradient.stops.map((stop, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={stop.color}
                onFocus={snapshot}
                onChange={(e) => updateStop(i, { color: e.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border bg-transparent"
                aria-label={`Stop ${i + 1} color`}
              />
              <Input
                value={stop.color}
                className="h-8"
                onFocus={snapshot}
                onChange={(e) => updateStop(i, { color: e.target.value })}
              />
              <div className="w-16 shrink-0">
                <NumberInput
                  value={stop.offset}
                  onChange={(offset) => updateStop(i, { offset })}
                />
              </div>
              <IconBtn
                label="Remove stop"
                onClick={() => removeStop(i)}
              >
                <X className="size-4" />
              </IconBtn>
            </div>
            <BrandSwatches onPick={(color) => updateStop(i, { color })} />
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addStop}>
        <Plus className="size-4" /> Add stop
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

export function PropertiesPanel() {
  const selectedIds = useEditor((s) => s.selectedIds);
  const element = useEditor((s) =>
    s.selectedIds.length === 1
      ? currentPage(s).elements.find((e) => e.id === s.selectedIds[0])
      : undefined,
  );

  if (selectedIds.length > 1) return <MultiPanel count={selectedIds.length} />;
  if (!element) return <CanvasPanel />;
  return <ElementPanel element={element} />;
}

function CanvasPanel() {
  const doc = useEditor((s) => s.doc);
  const background = useEditor((s) => currentPage(s).background);
  const setBackground = useEditor((s) => s.setBackground);
  const setCanvasSize = useEditor((s) => s.setCanvasSize);
  const brands = useEditor((s) => s.brands);
  const setBrandId = useEditor((s) => s.setBrandId);
  const currentPreset = (Object.keys(CANVAS_PRESETS) as CanvasPreset[]).find(
    (p) =>
      CANVAS_PRESETS[p].width === doc.width &&
      CANVAS_PRESETS[p].height === doc.height,
  );

  return (
    <Panel>
      <SectionTitle>Canvas</SectionTitle>
      <Field label="Ratio">
        <Select
          value={currentPreset ?? "custom"}
          onValueChange={(v) => {
            if (!v || v === "custom") return;
            const preset = CANVAS_PRESETS[v as CanvasPreset];
            setCanvasSize(preset.width, preset.height);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CANVAS_PRESETS) as CanvasPreset[]).map((p) => (
              <SelectItem key={p} value={p}>
                {CANVAS_PRESETS[p].label}
              </SelectItem>
            ))}
            {!currentPreset ? (
              <SelectItem value="custom">
                Custom ({doc.width}x{doc.height})
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </Field>
      {brands.length > 0 ? (
        <Field label="Brand">
          <Select
            value={doc.brandId ?? "none"}
            onValueChange={(v) => {
              if (!v) return;
              setBrandId(v === "none" ? null : v);
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field label="Page background">
        <FillInput value={background} onChange={setBackground} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput
            value={doc.width}
            onChange={(w) => setCanvasSize(w, doc.height)}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={doc.height}
            onChange={(h) => setCanvasSize(doc.width, h)}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Size applies to every page. Select an element to edit its properties.
      </p>
    </Panel>
  );
}

function MultiPanel({ count }: { count: number }) {
  const removeSelected = useEditor((s) => s.removeSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  return (
    <Panel>
      <SectionTitle>{count} elements selected</SectionTitle>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={duplicateSelected}>
          <Copy className="size-4" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" onClick={removeSelected}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
    </Panel>
  );
}

function ElementPanel({ element }: { element: TemplateElement }) {
  const update = useEditor((s) => s.updateElement);
  const removeSelected = useEditor((s) => s.removeSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const reorder = useEditor((s) => s.reorderSelected);
  const id = element.id;
  // Auto-width text chips derive their width from content — show it as read-only.
  const autoWidthText = element.type === "text" && !!element.autoWidth;

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <SectionTitle>{element.type}</SectionTitle>
        <div className="flex gap-1">
          <IconBtn label="Bring to front" onClick={() => reorder("front")}>
            <BringToFront className="size-4" />
          </IconBtn>
          <IconBtn label="Forward" onClick={() => reorder("forward")}>
            <ChevronUp className="size-4" />
          </IconBtn>
          <IconBtn label="Backward" onClick={() => reorder("backward")}>
            <ChevronDown className="size-4" />
          </IconBtn>
          <IconBtn label="Send to back" onClick={() => reorder("back")}>
            <SendToBack className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* Position & size */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <NumberInput value={Math.round(element.x)} onChange={(x) => update(id, { x })} />
        </Field>
        <Field label="Y">
          <NumberInput value={Math.round(element.y)} onChange={(y) => update(id, { y })} />
        </Field>
        <Field label="Width">
          {autoWidthText ? (
            <Input value="Auto" disabled className="h-8" aria-label="Width (auto)" />
          ) : (
            <NumberInput
              value={Math.round(element.width)}
              onChange={(width) => update(id, { width })}
            />
          )}
        </Field>
        <Field label="Height">
          <NumberInput
            value={Math.round(element.height)}
            onChange={(height) => update(id, { height })}
          />
        </Field>
        <Field label="Rotation">
          <NumberInput
            value={Math.round(element.rotation ?? 0)}
            onChange={(rotation) => update(id, { rotation })}
          />
        </Field>
        <Field label="Opacity">
          <Slider
            value={[element.opacity ?? 1]}
            min={0}
            max={1}
            step={0.01}
            onPointerDown={snapshot}
            onValueChange={(value) =>
              update(id, {
                opacity: Array.isArray(value) ? value[0] : value,
              })
            }
          />
        </Field>
      </div>

      <Separator />

      {element.type === "text" ? (
        <TextProps element={element} />
      ) : element.type === "image" ? (
        <ImageProps element={element} />
      ) : (
        <ShapeProps element={element} />
      )}

      <Separator />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={duplicateSelected}>
          <Copy className="size-4" /> Duplicate
        </Button>
        <Button variant="outline" size="sm" onClick={removeSelected}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
    </Panel>
  );
}

function TextProps({ element }: { element: TextElement }) {
  const update = useEditor((s) => s.updateElement);
  const brandFonts = useEditor((s) => activeBrand(s)?.fonts ?? NO_FONTS);
  const id = element.id;
  const bold = isBoldWeight(element.fontWeight);

  // Registry fonts (Satori-rendered) + brand fonts + whatever this element
  // already uses, de-duplicated.
  const fontOptions = useMemo(
    () => [
      ...new Set(
        [...BASE_FONTS, ...brandFonts.map((f) => f.name), element.fontFamily].filter(
          Boolean,
        ),
      ),
    ],
    [brandFonts, element.fontFamily],
  );
  const customFont = !FONTS[element.fontFamily];

  return (
    <>
      <Field label="Placeholder key (leave empty for fixed text)">
        <Input
          value={element.placeholderKey ?? ""}
          className="h-8"
          placeholder="e.g. title"
          onFocus={snapshot}
          onChange={(e) =>
            update(id, { placeholderKey: e.target.value || undefined })
          }
        />
      </Field>
      <Field label={element.placeholderKey ? "Fallback text" : "Text"}>
        <Textarea
          value={element.text}
          rows={3}
          onFocus={snapshot}
          onChange={(e) => update(id, { text: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Font">
          <Select
            value={element.fontFamily}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update(id, { fontFamily: v });
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full"
              style={{ fontFamily: cssFontFamily(element.fontFamily) }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontOptions.map((f) => (
                <SelectItem
                  key={f}
                  value={f}
                  style={{ fontFamily: cssFontFamily(f) }}
                >
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Size">
          {element.autoFit ? (
            <Input value="Auto" disabled className="h-8" aria-label="Size (auto-fit)" />
          ) : (
            <NumberInput
              value={element.fontSize}
              onChange={(fontSize) => update(id, { fontSize })}
            />
          )}
        </Field>
        <Field label="Style">
          <Toggle
            pressed={bold}
            variant="outline"
            size="default"
            className="h-8 w-full justify-start px-2.5"
            aria-label="Bold"
            title="Bold"
            onPressedChange={(pressed) => {
              snapshot();
              update(id, {
                fontWeight: pressed ? BOLD_FONT_WEIGHT : NORMAL_FONT_WEIGHT,
              });
            }}
          >
            <Bold className="size-4" />
            Bold
          </Toggle>
        </Field>
        <Field label="Weight">
          <Select
            value={String(element.fontWeight ?? 400)}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update(id, { fontWeight: Number(v) });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Line height">
          <NumberInput
            value={element.lineHeight ?? 1.2}
            step={0.1}
            onChange={(lineHeight) => update(id, { lineHeight })}
          />
        </Field>
      </div>
      {customFont ? (
        <p className="text-xs text-muted-foreground">
          Custom fonts preview here but render as Inter in the exported PNG until a
          font file is registered.
        </p>
      ) : null}
      <Field label="Align">
        <ToggleGroup
          value={[element.textAlign ?? "left"]}
          onValueChange={(value) => {
            const v = value[0] as TextElement["textAlign"];
            if (!v) return;
            snapshot();
            update(id, { textAlign: v });
          }}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem value="left" aria-label="Align left" className="flex-1">
            <AlignLeft className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center" className="flex-1">
            <AlignCenter className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right" className="flex-1">
            <AlignRight className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field label="Vertical align">
        <ToggleGroup
          value={[element.textVerticalAlign ?? (element.autoWidth ? "middle" : "top")]}
          onValueChange={(value) => {
            const v = value[0] as TextElement["textVerticalAlign"];
            if (!v) return;
            snapshot();
            update(id, { textVerticalAlign: v });
          }}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem value="top" aria-label="Align top" className="flex-1">
            <AlignVerticalJustifyStart className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="middle" aria-label="Align middle" className="flex-1">
            <AlignVerticalJustifyCenter className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" aria-label="Align bottom" className="flex-1">
            <AlignVerticalJustifyEnd className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Field label="Color">
        <ColorInput value={element.color} onChange={(color) => update(id, { color })} />
      </Field>

      <Separator />
      <SectionTitle>Box</SectionTitle>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Center content
        </Label>
        <Switch
          checked={
            (element.textAlign ?? "left") === "center" &&
            (element.textVerticalAlign ?? (element.autoWidth ? "middle" : "top")) ===
              "middle"
          }
          onCheckedChange={(checked) => {
            snapshot();
            update(id, {
              textAlign: checked ? "center" : "left",
              textVerticalAlign: checked ? "middle" : "top",
            });
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Auto width (hug text)
        </Label>
        <Switch
          checked={!!element.autoWidth}
          onCheckedChange={(checked) => {
            snapshot();
            // Auto width and fit-to-box are mutually exclusive: one sizes the box
            // to the text, the other sizes the text to the box.
            update(id, {
              autoWidth: checked || undefined,
              ...(checked ? { autoFit: undefined } : {}),
            });
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Fit to box (auto size)
        </Label>
        <Switch
          checked={!!element.autoFit}
          onCheckedChange={(checked) => {
            snapshot();
            update(id, {
              autoFit: checked || undefined,
              ...(checked ? { autoWidth: undefined } : {}),
            });
          }}
        />
      </div>
      {element.autoFit ? (
        <>
          <p className="text-xs text-muted-foreground">
            Font size grows or shrinks so the text fills this box. Resize the box
            to change it.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min size">
              <NumberInput
                value={element.minFontSize ?? FIT_MIN_FONT_SIZE}
                onChange={(minFontSize) => update(id, { minFontSize })}
              />
            </Field>
            <Field label="Max size">
              <NumberInput
                value={element.maxFontSize ?? FIT_MAX_FONT_SIZE}
                onChange={(maxFontSize) => update(id, { maxFontSize })}
              />
            </Field>
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Background</Label>
        <Switch
          checked={element.background !== undefined}
          onCheckedChange={(checked) => {
            snapshot();
            update(id, { background: checked ? "#ffffff" : undefined });
          }}
        />
      </div>
      {element.background !== undefined ? (
        <Field label="Background fill">
          <FillInput
            value={element.background}
            onChange={(background) => update(id, { background })}
          />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Padding X">
          <NumberInput
            value={element.paddingX ?? 0}
            onChange={(paddingX) => update(id, { paddingX })}
          />
        </Field>
        <Field label="Padding Y">
          <NumberInput
            value={element.paddingY ?? 0}
            onChange={(paddingY) => update(id, { paddingY })}
          />
        </Field>
        <Field label="Corner radius">
          <NumberInput
            value={element.borderRadius ?? 0}
            onChange={(borderRadius) => update(id, { borderRadius })}
          />
        </Field>
      </div>
    </>
  );
}

function ImageProps({ element }: { element: ImageElement }) {
  const update = useEditor((s) => s.updateElement);
  const id = element.id;
  const shape = element.shape ?? "rect";
  return (
    <>
      <Field label="Placeholder key (leave empty for fixed image)">
        <Input
          value={element.placeholderKey ?? ""}
          className="h-8"
          placeholder="e.g. background"
          onFocus={snapshot}
          onChange={(e) =>
            update(id, { placeholderKey: e.target.value || undefined })
          }
        />
      </Field>
      <Field label={element.placeholderKey ? "Fallback image URL" : "Image URL"}>
        <Input
          value={element.src ?? ""}
          className="h-8"
          placeholder="https://…"
          onFocus={snapshot}
          onChange={(e) => update(id, { src: e.target.value || undefined })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fit">
          <Select
            value={element.objectFit ?? "cover"}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update(id, { objectFit: v as ImageElement["objectFit"] });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Shape">
          <Select
            value={shape}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update(id, { shape: v as ImageElement["shape"] });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rect">Rectangle</SelectItem>
              <SelectItem value="ellipse">Circle / Ellipse</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {/* Corner radius is meaningless once the box is clipped to an ellipse. */}
        {shape === "rect" ? (
          <Field label="Corner radius">
            <NumberInput
              value={element.borderRadius ?? 0}
              onChange={(borderRadius) => update(id, { borderRadius })}
            />
          </Field>
        ) : null}
      </div>

      <Separator />
      <SectionTitle>Border</SectionTitle>
      <BorderControls element={element} />
    </>
  );
}

function ShapeProps({ element }: { element: ShapeElement }) {
  const update = useEditor((s) => s.updateElement);
  const id = element.id;
  // Polygon shapes (triangle, star, …) are clipped: a CSS border is sliced by the
  // clip and corner radius is a no-op, so hide both controls for them.
  const polygon = isPolygonShape(element.shape);
  return (
    <>
      <Field label="Fill">
        <FillInput value={element.fill} onChange={(fill) => update(id, { fill })} />
      </Field>
      {element.shape === "rect" ? (
        <Field label="Corner radius">
          <NumberInput
            value={element.borderRadius ?? 0}
            onChange={(borderRadius) => update(id, { borderRadius })}
          />
        </Field>
      ) : null}

      {polygon ? null : (
        <>
          <Separator />
          <SectionTitle>Border</SectionTitle>
          <BorderControls element={element} />
        </>
      )}
    </>
  );
}

/** Border width + style + color. Shared by image and shape elements. */
function BorderControls({
  element,
}: {
  element: ImageElement | ShapeElement;
}) {
  const update = useEditor((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput
            value={element.borderWidth ?? 0}
            onChange={(borderWidth) => update(id, { borderWidth })}
          />
        </Field>
        <Field label="Style">
          <Select
            value={element.borderStyle ?? "solid"}
            onValueChange={(v) => {
              if (!v) return;
              snapshot();
              update(id, { borderStyle: v as BorderStyle });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
              <SelectItem value="dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Color">
        <ColorInput
          value={element.borderColor ?? "#000000"}
          onChange={(borderColor) => update(id, { borderColor })}
        />
      </Field>
    </>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 p-4">{children}</div>;
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
