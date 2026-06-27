"use client";

import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/lib/hooks/use-autosave";

const STATUS: Record<SaveStatus, { tone: string; label: string; pulse: boolean }> =
  {
    saved: { tone: "bg-emerald-500/70", label: "All changes saved", pulse: false },
    saving: { tone: "bg-amber-400/80", label: "Saving…", pulse: true },
    unsaved: { tone: "bg-amber-400/80", label: "Unsaved changes", pulse: false },
  };

/** A small, subtle dot reflecting an editor's save state (next to a Save button). */
export function SaveStatusDot({
  status,
  className,
}: {
  status: SaveStatus;
  className?: string;
}) {
  const { tone, label, pulse } = STATUS[status];
  return (
    <span
      className={cn("relative inline-flex size-2 shrink-0", className)}
      role="status"
      aria-label={label}
      title={label}
    >
      {pulse ? (
        <span
          className={cn(
            "absolute inset-0 inline-flex animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full transition-colors",
          tone,
        )}
      />
    </span>
  );
}
