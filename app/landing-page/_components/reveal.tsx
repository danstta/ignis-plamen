"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface RevealProps extends React.ComponentProps<"div"> {
  /** Delay before the reveal transition starts, in ms. Use for stagger. */
  delay?: number;
}

/**
 * Scroll-triggered reveal wrapper.
 *
 * Adds the `lp-reveal` class (opacity + translateY transition, GPU-only) and
 * flips `data-revealed` on the element once it scrolls into view. The
 * transition itself lives in `globals.css` so it runs off the main thread and
 * stays smooth even while the browser is busy loading content.
 *
 * - Reveals once, then disconnects the observer.
 * - Honors `prefers-reduced-motion`: shows immediately, no transition.
 * - Stagger via the `delay` prop (keep 30-80ms between siblings).
 */
export function Reveal({
  delay = 0,
  className,
  style,
  children,
  ...props
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: CSS forces `.lp-reveal` visible — nothing to do here.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // Legacy env without IntersectionObserver — reveal via the DOM attribute
    // directly (no setState, so no re-render to strip it).
    if (typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-revealed", "");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-revealed={revealed ? "" : undefined}
      className={cn("lp-reveal", className)}
      style={{
        transitionDelay: revealed ? `${delay}ms` : "0ms",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
