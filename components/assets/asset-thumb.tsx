import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/assets/types";

/**
 * Square asset preview with a checkerboard backdrop so transparent PNGs/SVGs read
 * clearly. Plain <img> (not next/image) — asset URLs are external (Supabase) and
 * arbitrary, and SVGs don't benefit from the optimizer.
 */
export function AssetThumb({
  asset,
  className,
}: {
  asset: Asset;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-[length:16px_16px] bg-[position:0_0,8px_8px]",
        "bg-[linear-gradient(45deg,var(--color-muted)_25%,transparent_25%,transparent_75%,var(--color-muted)_75%),linear-gradient(45deg,var(--color-muted)_25%,transparent_25%,transparent_75%,var(--color-muted)_75%)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.url}
        alt={asset.name}
        loading="lazy"
        className="size-full object-contain p-2"
      />
    </div>
  );
}
