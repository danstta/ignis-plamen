import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { RunStatusBadge } from "./run-status-badge";

/**
 * One run as a clickable row, linking to its detail page. Shared by the global
 * Runs page and the dashboard's recent-runs list (which pass `workflowName` to
 * tag the run) and the per-workflow runs page (which omits it — the workflow is
 * already the page context). Server-rendered: the relative time is computed at
 * render and refreshed when the list re-renders.
 */
export function RunListItem({
  runId,
  workflowId,
  workflowName,
  status,
  createdAt,
  className,
}: {
  runId: string;
  workflowId: string;
  workflowName?: string;
  status: string;
  createdAt: Date | string;
  className?: string;
}) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return (
    <Link
      href={`/workflows/${workflowId}/runs/${runId}`}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent",
        className,
      )}
    >
      <RunStatusBadge status={status} />
      <div className="min-w-0 flex-1">
        {workflowName ? (
          <p className="truncate text-sm font-medium">{workflowName}</p>
        ) : null}
        <p className="truncate text-xs text-muted-foreground">
          <time dateTime={created.toISOString()} title={created.toLocaleString()}>
            {formatRelativeTime(created)}
          </time>
          <span className="mx-1.5 opacity-50">·</span>
          <span className="font-mono">{runId.slice(0, 8)}</span>
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
    </Link>
  );
}
