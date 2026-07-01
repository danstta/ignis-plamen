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
import { Button } from "@/components/ui/button";
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
    className: "text-blue-600 dark:text-blue-400",
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

export function RunNodeLogPanel({
  nodeLabel,
  state,
  logs,
  isLlmNode,
}: {
  nodeLabel: string;
  state: NodeRunState;
  logs: RunLogEntry[];
  isLlmNode: boolean;
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
    <div className="mt-3 rounded-lg border bg-background/70">
      <div className="flex min-h-10 items-center gap-2 px-3">
        <StatusIcon
          className={cn(
            "size-4 shrink-0",
            tone.className,
            state === "running" && "animate-spin",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium">{tone.label}</span>
            <span className="text-xs text-muted-foreground">
              {isLlmNode ? "LLM trace" : "Node logs"}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {logs.length}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${open ? "Hide" : "Show"} logs for ${nodeLabel}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </Button>
      </div>

      {open ? (
        <div className="border-t bg-muted/30">
          {logs.length > 0 ? (
            <ol className="max-h-64 overflow-auto py-1">
              {logs.map((entry) => (
                <li
                  key={entry.id}
                  className="grid grid-cols-[4.5rem_1fr] gap-3 px-3 py-2 text-xs"
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
      ) : null}
    </div>
  );
}
