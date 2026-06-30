"use client";

import { useMemo, useState } from "react";
import { Braces, Check, ChevronRight, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toStructuralPath } from "@/lib/workflows/references";
import { cn } from "@/lib/utils";

type SampleField = { path: string; preview?: string };

/** Pixels of indent per tree depth level. */
const INDENT = 16;

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === "object";
}

/** Child [key, value] entries of an object/array container, in display order. */
function entriesOf(
  v: Record<string, unknown> | unknown[],
): [string, unknown][] {
  return Array.isArray(v)
    ? v.map((item, i) => [String(i), item] as [string, unknown])
    : Object.entries(v);
}

/** Pre-expand the first couple of container levels for quick scanning. */
function defaultExpanded(sample: unknown): Set<string> {
  const set = new Set<string>();
  const walk = (v: unknown, path: string, depth: number) => {
    if (!isContainer(v) || depth > 2) return;
    if (path) set.add(path);
    for (const [k, child] of entriesOf(v)) {
      walk(child, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(sample, "", 0);
  return set;
}

/** Color-coded inline preview of a leaf value, mirroring the Pipedream tree. */
function LeafValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">null</span>;
  if (typeof value === "string")
    return <span className="text-rose-600 dark:text-rose-400">{value}</span>;
  return (
    <span className="text-sky-600 dark:text-sky-400">{String(value)}</span>
  );
}

/** The per-row "Select path" toggle — faint until hover, solid once chosen. */
function SelectButton({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition",
        selected
          ? "bg-foreground text-background"
          : "text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      {selected ? <Check className="size-3" /> : <Plus className="size-3" />}
      {selected ? "Selected" : "Select path"}
    </button>
  );
}

/** One payload property (and, when expanded, its descendants). */
function TreeRow({
  label,
  value,
  path,
  depth,
  expanded,
  toggleExpand,
  selected,
  toggleSelect,
}: {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (p: string) => void;
  selected: Set<string>;
  toggleSelect: (p: string) => void;
}) {
  const container = isContainer(value);
  const isOpen = expanded.has(path);
  // Selections are stored structurally (array indices as `*`), so every element's
  // row reflects — and toggles — the one shared path for that field across the array.
  const isSel = selected.has(toStructuralPath(path));
  const children = container ? entriesOf(value) : [];

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded py-1 pr-1.5 text-xs hover:bg-accent/50",
          isSel && "bg-accent",
        )}
        style={{ paddingLeft: depth * INDENT + 6 }}
      >
        {container ? (
          <button
            type="button"
            onClick={() => toggleExpand(path)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-90",
              )}
            />
            <code className="min-w-0 truncate font-mono font-medium" title={label}>
              {label}
            </code>
            <span className="shrink-0 text-muted-foreground/70">
              {Array.isArray(value) ? `[${children.length}]` : `{${children.length}}`}
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="inline-block w-3.5 shrink-0" />
            <code
              className="min-w-0 truncate font-mono font-medium"
              title={label}
            >
              {label}
            </code>
            <span
              className="min-w-0 flex-1 truncate font-mono"
              title={String(value ?? "null")}
            >
              <span className="text-muted-foreground">: </span>
              <LeafValue value={value} />
            </span>
          </div>
        )}

        <SelectButton selected={isSel} onClick={() => toggleSelect(path)} />
      </div>

      {container && isOpen
        ? children.map(([k, v]) => (
            <TreeRow
              key={`${path}.${k}`}
              label={k}
              value={v}
              path={`${path}.${k}`}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selected={selected}
              toggleSelect={toggleSelect}
            />
          ))
        : null}
    </>
  );
}

/**
 * Roomy modal for inspecting a captured webhook payload as a collapsible tree and
 * choosing which exact dot-paths are offered to downstream nodes. Selection is the
 * source of truth (see collectUpstreamFields): only chosen paths appear in the
 * "Data" picker — nothing chosen means the webhook exposes nothing.
 */
export function WebhookFieldsDialog({
  sample,
  selectedFields,
  onChange,
}: {
  sample: unknown;
  sampleFields: SampleField[];
  selectedFields: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="self-start" />}
      >
        <Braces /> Inspect &amp; select fields
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Webhook payload</DialogTitle>
          <DialogDescription>
            Hover a property and click <span className="font-medium">Select
            path</span> to expose it to downstream nodes. Only selected properties
            appear in the “Data” picker.
          </DialogDescription>
        </DialogHeader>

        <PayloadFieldSelector
          sample={sample}
          selectedFields={selectedFields}
          onChange={onChange}
          maxHeightClassName="max-h-[55vh]"
          emptyText="No payload captured yet."
        />
      </DialogContent>
    </Dialog>
  );
}

export function PayloadFieldSelector({
  sample,
  selectedFields,
  onChange,
  maxHeightClassName = "max-h-96",
  emptyText = "No output yet.",
}: {
  sample: unknown;
  selectedFields: string[];
  onChange: (next: string[]) => void;
  maxHeightClassName?: string;
  emptyText?: string;
}) {
  const selected = useMemo(() => new Set(selectedFields), [selectedFields]);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultExpanded(sample),
  );

  const toggleExpand = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const toggleSelect = (rawPath: string) => {
    const p = toStructuralPath(rawPath);
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange([...next]);
  };

  const roots = isContainer(sample) ? entriesOf(sample) : [];

  return (
    <Tabs defaultValue="tree" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{selected.size} selected</span>
          {selected.size > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <TabsContent value="tree" className="min-w-0">
        <div
          className={cn(
            "min-h-0 overflow-auto rounded-md border p-1",
            maxHeightClassName,
          )}
        >
          {roots.length ? (
            roots.map(([k, v]) => (
              <TreeRow
                key={k}
                label={k}
                value={v}
                path={k}
                depth={0}
                expanded={expanded}
                toggleExpand={toggleExpand}
                selected={selected}
                toggleSelect={toggleSelect}
              />
            ))
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {emptyText}
            </p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="raw" className="min-w-0">
        <pre
          className={cn(
            "overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs",
            maxHeightClassName,
          )}
        >
          {JSON.stringify(sample ?? {}, null, 2)}
        </pre>
      </TabsContent>
    </Tabs>
  );
}
