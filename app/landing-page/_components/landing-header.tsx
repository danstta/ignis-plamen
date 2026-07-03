"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, GitFork } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Design", href: "#design" },
  { label: "Workflows", href: "#workflows" },
  { label: "How it works", href: "#how-it-works" },
];

function ThemeToggle() {
  const { setTheme } = useTheme();

  function toggle() {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground"
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="size-4 dark:hidden" />
    </button>
  );
}

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-transparent transition-colors",
        scrolled &&
          "border-border bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/landing-page" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
            <span className="text-sm font-bold">I</span>
          </div>
          <span className="text-base font-semibold tracking-tight">Ignis</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            render={
              <a
                href="https://github.com/danstta/ignis"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
              />
            }
          >
            <GitFork className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
