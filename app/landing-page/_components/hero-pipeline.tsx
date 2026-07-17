import { Fragment, type CSSProperties } from "react";
import { LayoutTemplate, MapPin, ScanEye, Webhook } from "lucide-react";

import { GoogleDriveIcon } from "@/components/icons/google-drive";

import { LISBON_GRADIENT, PosterBrandRow } from "./poster";

/**
 * The hero's signature: a compact workflow that "ignites" — an ember spark
 * travels down the chain, lighting each step badge as it passes, and lands in
 * the rendered poster. Timing lives in landing.css (badge-ignite/spark-fall);
 * reduced-motion users see the finished, static pipeline.
 */

const STEPS = [
  { badge: "S1", label: "Webhook", sub: 'city: "Lisbon"', icon: Webhook },
  { badge: "S2", label: "Find Location Images", sub: "12 candidates", icon: MapPin },
  { badge: "S3", label: "Rank Images", sub: "vision model · best 0.94", icon: ScanEye },
  { badge: "S4", label: "Render Template", sub: "Lisbon Poster · 3 pages", icon: LayoutTemplate },
];

const DOTS_MASK = "radial-gradient(ellipse at center, black 55%, transparent 100%)";

export function HeroPipeline() {
  return (
    <div className="hero-pipeline relative">
      {/* The workflow editor's dotted canvas, fading out at the edges. */}
      <div
        aria-hidden
        className="absolute -inset-10 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          WebkitMaskImage: DOTS_MASK,
          maskImage: DOTS_MASK,
        }}
      />

      <div className="flex w-64 flex-col">
        {STEPS.map((step, i) => (
          <Fragment key={step.badge}>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
              <span
                className="hero-badge flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md bg-muted px-1.5 font-mono text-[11px] font-semibold text-muted-foreground"
                style={{ "--seq": i } as CSSProperties}
              >
                {step.badge}
              </span>
              <step.icon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {step.label}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {step.sub}
                </span>
              </div>
            </div>
            <div className="relative ml-[30px] h-5 w-px bg-border">
              <span
                className="hero-spark absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ember"
                style={{ "--seq": i } as CSSProperties}
              />
            </div>
          </Fragment>
        ))}

        <div
          className="hero-poster relative w-64 overflow-hidden rounded-xl"
          style={{ background: LISBON_GRADIENT }}
        >
          <div className="flex aspect-[4/5] flex-col justify-between p-4">
            <PosterBrandRow />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/70">
                Travel series · Nº 07
              </p>
              <p className="font-display mt-1.5 text-4xl font-bold leading-none text-white">
                Lisbon
              </p>
              <p className="mt-2 text-[11px] text-white/80">
                Golden hour on the Tagus
              </p>
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <GoogleDriveIcon className="size-3.5 shrink-0" />
          lisbon-poster.png → Google Drive
        </p>
      </div>
    </div>
  );
}
