import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  running: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  waiting: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const LABELS: Record<string, string> = {
  running: "Running",
  waiting: "Waiting for review",
  success: "Success",
  error: "Error",
};

export function RunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
        STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
