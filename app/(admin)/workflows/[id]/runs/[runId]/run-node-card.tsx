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
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeRunState, RunLogEntry } from "@/lib/workflows/types";

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
  return "No logs were recorded for this node.";
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
  const defaultOpen =
    state === "running" ||
    state === "waiting" ||
    state === "error" ||
    (state === "pending" && logs.length > 0);
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
