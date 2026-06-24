"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Candidate = { url: string; attribution?: string };

/** Grid of candidate images for a paused run; clicking one resumes the run. */
export function ManualReviewPicker({
  runId,
  resumeToken,
  candidates,
}: {
  runId: string;
  resumeToken: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function pick(url: string) {
    setSubmitting(url);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, url }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success("Image selected — finishing run");
      router.refresh();
    } catch (err) {
      toast.error("Failed to submit selection", { description: String(err) });
      setSubmitting(null);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No candidate images were produced.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {candidates.map((c) => (
        <button
          key={c.url}
          type="button"
          onClick={() => pick(c.url)}
          disabled={submitting !== null}
          className="group relative overflow-hidden rounded-lg border text-left transition-colors hover:border-foreground/40 disabled:opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.url} alt="" className="aspect-square w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {submitting === c.url ? "Selecting…" : "Use this image"}
          </span>
        </button>
      ))}
    </div>
  );
}
