import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Inert stand-ins for the app's popover-based primitives (Select, dropdown
 * triggers) used inside the landing-page mockups. Everything else in the
 * mockups is the real component (Button, Input, Switch, …) rendered with
 * static values; only the pieces that need a provider/portal are faked, with
 * class names copied from components/ui/select.tsx so they match visually.
 */
export function MockSelect({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap dark:bg-input/30",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
