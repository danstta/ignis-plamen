import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A single dashboard metric. Optionally a link to the page it summarizes — when
 * `href` is set the whole card becomes a hover-highlighted target.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-1 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10",
        href && "transition-colors hover:bg-accent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
