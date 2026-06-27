"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RunStatus } from "@/lib/workflows/types";

/**
 * How often to poll per status. `running` is watched tightly; `waiting` is polled
 * too (slower) so an async resume surfaces on its own. Terminal statuses are
 * absent — the effect stops polling once a run reaches one.
 */
const POLL_MS: Partial<Record<RunStatus, number>> = {
  running: 2000,
  waiting: 5000,
};

/**
 * Renders nothing; drives live progress for the (now async) run-detail page.
 * Polls the lightweight status endpoint and, when the run's `updatedAt` advances,
 * calls `router.refresh()` to re-render the server page with fresh `getRun` data.
 */
export function RunLive({
  runId,
  status,
  updatedAt,
}: {
  runId: string;
  status: RunStatus;
  updatedAt: string;
}) {
  const router = useRouter();
  const lastUpdatedAt = useRef(updatedAt);

  // Re-baseline whenever the server page re-renders with fresher data, so a
  // refresh we just triggered isn't re-detected as another change.
  useEffect(() => {
    lastUpdatedAt.current = updatedAt;
  }, [updatedAt]);

  useEffect(() => {
    const interval = POLL_MS[status];
    if (!interval) return; // terminal (success/error) — nothing to watch.

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/runs/${runId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const next = (await res.json()) as { updatedAt: string };
        if (!cancelled && next.updatedAt !== lastUpdatedAt.current) {
          lastUpdatedAt.current = next.updatedAt;
          router.refresh();
        }
      } catch {
        // Transient network error — keep polling.
      }
    }, interval);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, status, router]);

  return null;
}
