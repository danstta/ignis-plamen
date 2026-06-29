"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RunListItem } from "./run-list-item";

/** Shape accepted from the server (Dates) and from the poll endpoint (ISO strings). */
export type LiveRun = {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

type Run = {
  id: string;
  workflowId: string;
  workflowName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** How long the enter-highlight class stays on a freshly-arrived row (> the CSS animation). */
const HIGHLIGHT_MS = 1300;

function toIso(v: string | Date | undefined): string {
  if (v instanceof Date) return v.toISOString();
  return v ?? new Date(0).toISOString();
}

function normalize(r: LiveRun): Run {
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflowName ?? null,
    status: r.status,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt ?? r.createdAt),
  };
}

/**
 * Client-managed, self-refreshing run list. Seeds from the server-rendered runs so
 * first paint is instant, then polls the lightweight `/recent` feed and *merges*:
 * brand-new runs prepend with a one-shot enter animation, in-flight runs update
 * their status in place, and relative timestamps keep ticking. Polling pauses while
 * the tab is hidden and degrades quietly on error (the last good list stays put).
 *
 * Merging (rather than replacing) means a small poll window never truncates a long
 * server-rendered list. Reused by the per-workflow runs page, the global Runs page,
 * and the dashboard's recent-runs widget — the only differences are props.
 *
 * On the global page, pass a `key` derived from the active filters so a filter
 * change remounts and re-seeds from the freshly-filtered server runs.
 */
export function RunsLiveList({
  initialRuns,
  emptyState,
  showWorkflowName = false,
  workflowId,
  status,
  q,
  pollLimit = 50,
  maxRows,
  intervalMs = 3000,
  className,
}: {
  initialRuns: LiveRun[];
  emptyState: ReactNode;
  showWorkflowName?: boolean;
  workflowId?: string;
  status?: string;
  q?: string;
  /** How many recent runs each poll fetches — enough to catch a burst between ticks. */
  pollLimit?: number;
  /** Cap on rendered rows; oldest are trimmed when new ones prepend. Defaults to the seed size. */
  maxRows?: number;
  intervalMs?: number;
  className?: string;
}) {
  const [runs, setRuns] = useState<Run[]>(() => initialRuns.map(normalize));
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());

  // Mirror the latest state/props into refs so the poll closure reconciles against
  // current values without re-subscribing the interval on every change.
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);
  const cap = maxRows ?? Math.max(initialRuns.length, pollLimit);
  const capRef = useRef(cap);
  useEffect(() => {
    capRef.current = cap;
  }, [cap]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const query = new URLSearchParams();
  if (workflowId) query.set("workflow", workflowId);
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  query.set("limit", String(pollLimit));
  const queryString = query.toString();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/workflows/runs/recent?${queryString}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { runs: LiveRun[] | null };
        // `null` signals a transient server error — keep the current list intact.
        if (cancelled || !Array.isArray(data.runs)) return;

        const fetched = data.runs.map(normalize);
        const prev = runsRef.current;
        const prevIds = new Set(prev.map((r) => r.id));
        const fetchedById = new Map(fetched.map((r) => [r.id, r]));

        let changed = false;
        const updated = prev.map((r) => {
          const f = fetchedById.get(r.id);
          if (f && (f.status !== r.status || f.updatedAt !== r.updatedAt)) {
            changed = true;
            return f;
          }
          return r;
        });
        // New runs are created with `createdAt = now`, so additions are always
        // newer than everything held — prepend them (newest first) at the top.
        const additions = fetched.filter((r) => !prevIds.has(r.id));
        if (additions.length) changed = true;
        if (!changed) return;

        let next = additions.length ? [...additions, ...updated] : updated;
        if (next.length > capRef.current) next = next.slice(0, capRef.current);
        setRuns(next);

        if (additions.length) {
          const ids = additions.map((a) => a.id);
          setHighlighted((h) => new Set([...h, ...ids]));
          const timer = setTimeout(() => {
            setHighlighted((h) => {
              const n = new Set(h);
              for (const id of ids) n.delete(id);
              return n;
            });
          }, HIGHLIGHT_MS);
          timeoutsRef.current.push(timer);
        }
      } catch {
        // Transient network error — keep polling, keep the current list.
      }
    }

    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [queryString, intervalMs]);

  // Keep "2 minutes ago" advancing even when no new data arrives.
  const [, bumpClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => bumpClock((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Drop any pending highlight timers on unmount.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const t of timeouts) clearTimeout(t);
    };
  }, []);

  if (runs.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      <div className="divide-y rounded-lg border">
        {runs.map((r) => (
          <RunListItem
            key={r.id}
            runId={r.id}
            workflowId={r.workflowId}
            workflowName={
              showWorkflowName ? (r.workflowName ?? undefined) : undefined
            }
            status={r.status}
            createdAt={r.createdAt}
            className={highlighted.has(r.id) ? "run-enter" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
