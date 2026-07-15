"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  House,
  LayoutTemplate,
  Settings,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/templates", label: "Designs", icon: LayoutTemplate },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Bottom navigation for small screens, where the sidebar is hidden. Fixed to
 * the viewport bottom; the admin layout reserves matching bottom padding so
 * page content never hides behind it.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      <div className="flex h-16 items-stretch">
        {ITEMS.map(({ href, label, icon: Icon, ...item }) => {
          const active =
            "exact" in item && item.exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              data-active={active || undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors",
                "hover:text-foreground focus-visible:bg-sidebar-accent",
                "data-active:text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
