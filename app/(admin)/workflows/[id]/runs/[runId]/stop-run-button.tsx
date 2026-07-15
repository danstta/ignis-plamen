"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StopRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stopping, setStopping] = useState(false);

  async function stopRun() {
    if (
      !window.confirm(
        "Stop this run? Any node already calling an external service may finish, but no further nodes will run.",
      )
    ) {
      return;
    }

    setStopping(true);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/stop`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Stop failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not stop run");
    } finally {
      setStopping(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={stopRun}
      disabled={stopping || pending}
    >
      <Square className="size-3.5" />
      {stopping || pending ? "Stopping" : "Stop run"}
    </Button>
  );
}
