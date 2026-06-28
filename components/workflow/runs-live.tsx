"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Renders nothing; keeps a server-rendered run list fresh. Polls the lightweight
 * activity endpoint and calls `router.refresh()` when the signature changes (a
 * new run appeared or one advanced). Skips polling while the tab is hidden to
 * avoid needless work. The first poll only baselines the signature, so mounting
 * never triggers an immediate refresh.
 */
export function RunsLive({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/workflows/runs/activity", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          count: number;
          latest: string | null;
        };
        const signature = `${data.count}:${data.latest ?? ""}`;
        if (lastSignature.current === null) {
          lastSignature.current = signature; // first poll: baseline only
        } else if (signature !== lastSignature.current) {
          lastSignature.current = signature;
          router.refresh();
        }
      } catch {
        // Transient network error — keep polling.
      }
    }

    const timer = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router, intervalMs]);

  return null;
}
