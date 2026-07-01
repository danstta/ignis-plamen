"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Candidate = { url: string; attribution?: string };

function uniqueByUrl(images: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url || seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

function ImageTile({
  image,
  action,
  label,
  disabled,
}: {
  image: Candidate;
  action: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt="" className="aspect-square w-full object-cover" />
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        onClick={action}
        disabled={disabled}
        aria-label={label}
        className="absolute right-2 top-2 opacity-90 shadow-sm transition-opacity group-hover:opacity-100"
      >
        {label === "Remove" ? <X className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}

export function CurateImagesPicker({
  runId,
  resumeToken,
  selected,
  alternates,
  selectionCount,
}: {
  runId: string;
  resumeToken: string;
  selected: Candidate[];
  alternates: Candidate[];
  selectionCount: number;
}) {
  const router = useRouter();
  const [selectedUrls, setSelectedUrls] = useState(() =>
    uniqueByUrl(selected)
      .slice(0, selectionCount)
      .map((image) => image.url),
  );
  const [submitting, setSubmitting] = useState(false);

  const allImages = useMemo(
    () => uniqueByUrl([...selected, ...alternates]),
    [selected, alternates],
  );
  const byUrl = useMemo(
    () => new Map(allImages.map((image) => [image.url, image])),
    [allImages],
  );
  const selectedImages = selectedUrls.flatMap((url) => {
    const image = byUrl.get(url);
    return image ? [image] : [];
  });
  const alternateImages = allImages.filter(
    (image) => !selectedUrls.includes(image.url),
  );

  function remove(url: string) {
    setSelectedUrls((current) => current.filter((item) => item !== url));
  }

  function add(url: string) {
    setSelectedUrls((current) => {
      if (current.includes(url) || current.length >= selectionCount) return current;
      return [...current, url];
    });
  }

  async function submit() {
    if (selectedUrls.length === 0) {
      toast.error("Choose at least one image before continuing");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, selectedUrls }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      toast.success("Image set selected - finishing run");
      router.refresh();
    } catch (err) {
      toast.error("Failed to submit selection", { description: String(err) });
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selectedImages.length}/{selectionCount} selected
        </p>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={submitting || selectedImages.length === 0}
        >
          <Check className="size-4" />
          Continue
        </Button>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Selected
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {selectedImages.map((image) => (
            <ImageTile
              key={image.url}
              image={image}
              action={() => remove(image.url)}
              label="Remove"
              disabled={submitting}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Alternates
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {alternateImages.map((image) => (
            <ImageTile
              key={image.url}
              image={image}
              action={() => add(image.url)}
              label="Add"
              disabled={submitting || selectedImages.length >= selectionCount}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
