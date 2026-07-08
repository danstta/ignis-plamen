"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleAlert,
  Clock3,
  LoaderCircle,
  PauseCircle,
  Square,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeRunState, RunLogEntry } from "@/lib/workflows/types";

type ImagePreview = {
  url: string;
  title?: string;
  source?: string;
  attribution?: string;
  locationQuery?: string;
};

type ImageQueryGroup = {
  query: string;
  candidates: ImagePreview[];
};

const STATE_TONE: Record<
  NodeRunState,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock3,
    className: "text-muted-foreground",
  },
  running: {
    label: "Active",
    icon: LoaderCircle,
    className: "text-sky-600 dark:text-sky-400",
  },
  done: {
    label: "Done",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "Error",
    icon: CircleAlert,
    className: "text-destructive",
  },
  waiting: {
    label: "Waiting",
    icon: PauseCircle,
    className: "text-amber-600 dark:text-amber-400",
  },
  stopped: {
    label: "Stopped",
    icon: Square,
    className: "text-muted-foreground",
  },
};

function logTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function emptyMessage(state: NodeRunState) {
  if (state === "pending") return "No logs yet. This node has not started.";
  if (state === "running") return "Active now. Waiting for the next log line.";
  if (state === "stopped") return "Stopped before this node could finish.";
  return "No logs were recorded for this node.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toImagePreview(value: unknown): ImagePreview | undefined {
  if (typeof value === "string" && value.trim()) {
    return { url: value.trim() };
  }
  if (!isRecord(value) || typeof value.url !== "string" || !value.url.trim()) {
    return undefined;
  }
  return {
    url: value.url.trim(),
    title: typeof value.title === "string" ? value.title : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
    attribution:
      typeof value.attribution === "string" ? value.attribution : undefined,
    locationQuery:
      typeof value.locationQuery === "string" ? value.locationQuery : undefined,
  };
}

function imageQueryGroups(outputs: Record<string, unknown>): ImageQueryGroup[] {
  const rawGroups = outputs.queryResults;
  if (Array.isArray(rawGroups)) {
    return rawGroups.flatMap((group): ImageQueryGroup[] => {
      if (!isRecord(group) || typeof group.query !== "string") return [];
      const candidates = Array.isArray(group.candidates)
        ? group.candidates.flatMap((candidate) => {
            const image = toImagePreview(candidate);
            return image ? [image] : [];
          })
        : [];
      return candidates.length > 0
        ? [{ query: group.query, candidates }]
        : [];
    });
  }

  const candidates = Array.isArray(outputs.candidates) ? outputs.candidates : [];
  const byQuery = new Map<string, ImagePreview[]>();
  for (const candidate of candidates) {
    const image = toImagePreview(candidate);
    if (!image) continue;
    const query = image.locationQuery || "Location query";
    byQuery.set(query, [...(byQuery.get(query) ?? []), image]);
  }
  return [...byQuery.entries()].map(([query, grouped]) => ({
    query,
    candidates: grouped,
  }));
}

function ImageGroupsPreview({ outputs }: { outputs: Record<string, unknown> }) {
  const groups = imageQueryGroups(outputs);
  const total = groups.reduce((sum, group) => sum + group.candidates.length, 0);
  if (groups.length === 0) return null;

  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">
          Images by query
        </p>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {total} total
        </span>
      </div>
      <div className="max-h-96 space-y-3 overflow-auto pr-1">
        {groups.map((group, groupIndex) => (
          <section key={`${group.query}-${groupIndex}`} className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h4 className="min-w-0 truncate text-xs font-medium">
                {group.query}
              </h4>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                {group.candidates.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {group.candidates.map((image, index) => (
                <a
                  key={`${image.url}-${index}`}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group min-w-0 rounded-md border bg-background outline-none transition hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50"
                  title={
                    image.title ??
                    image.source ??
                    image.attribution ??
                    image.url
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.title ?? `${group.query} candidate ${index + 1}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-t-[calc(var(--radius)-1px)] object-cover"
                  />
                  <div className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                    {image.source ?? image.title ?? `Image ${index + 1}`}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * One workflow node as a single self-contained disclosure card: a clickable
 * header (status icon + label + state + log count) expands to reveal logs and,
 * when present, the node's output — one toggle per node instead of a stack of
 * nested chevron strips. Active/waiting/error nodes default open so the live
 * state is visible without an extra click.
 */
export function RunNodeCard({
  nodeLabel,
  state,
  logs,
  isLlmNode,
  outputs,
}: {
  nodeLabel: string;
  state: NodeRunState;
  logs: RunLogEntry[];
  isLlmNode: boolean;
  outputs?: Record<string, unknown>;
}) {
  const hasGroupedImages = outputs ? imageQueryGroups(outputs).length > 0 : false;
  const defaultOpen =
    state === "running" ||
    state === "waiting" ||
    state === "error" ||
    (state === "pending" && logs.length > 0) ||
    hasGroupedImages;
  const [open, setOpen] = useState(defaultOpen);
  const tone = STATE_TONE[state];
  const StatusIcon = tone.icon;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${nodeLabel}-panel`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-accent"
      >
        <StatusIcon
          className={cn(
            "size-4 shrink-0",
            tone.className,
            state === "running" && "animate-spin",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {nodeLabel}
        </span>
        <span className={cn("text-xs", tone.className)}>{tone.label}</span>
        {logs.length > 0 ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
            {logs.length}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t">
          <div className="bg-muted/20">
            {logs.length > 0 ? (
              <ol className="max-h-48 overflow-auto py-1">
                {logs.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[4rem_1fr] gap-2 px-3 py-1.5 text-xs"
                  >
                    <time className="font-mono text-[11px] text-muted-foreground">
                      {logTime(entry.timestamp)}
                    </time>
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-1 size-1.5 shrink-0 rounded-full",
                            entry.level === "error"
                              ? "bg-destructive"
                              : entry.level === "warn"
                                ? "bg-amber-500"
                                : "bg-foreground/35",
                          )}
                        />
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
                          {entry.message}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                {state === "pending" ? (
                  <Circle className="size-3" />
                ) : (
                  <Terminal className="size-3" />
                )}
                {emptyMessage(state)}
              </div>
            )}
          </div>

          {outputs ? (
            <div className="border-t">
              <ImageGroupsPreview outputs={outputs} />
              <div className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">
                {isLlmNode ? "LLM output" : "Output"}
              </div>
              <pre className="max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(outputs, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
