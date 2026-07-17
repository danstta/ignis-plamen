import { cn } from "@/lib/utils";

import { IgnisMark } from "./ignis-mark";

/**
 * Window chrome shared by every product mockup: the Ignis mark, the in-app
 * route the screen depicts, and the autosave indicator the real editors show.
 */
export function AppFrame({
  path,
  children,
  className,
}: {
  path: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/10 dark:shadow-black/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <IgnisMark className="size-[18px] rounded-[5px]" iconClassName="size-2.5" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {path}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Autosaved
        </span>
      </div>
      {children}
    </div>
  );
}
