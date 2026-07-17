import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The Ignis brand mark: an ember flame on a dark tile. Pass a size via
 * `className` (defaults to size-6) and match the icon with `iconClassName`.
 */
export function IgnisMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-foreground",
        className ?? "size-6",
      )}
    >
      <Flame
        aria-hidden
        fill="currentColor"
        strokeWidth={1.5}
        className={cn("text-ember", iconClassName ?? "size-3.5")}
      />
    </span>
  );
}
