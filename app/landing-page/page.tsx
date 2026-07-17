import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { GoogleDriveIcon } from "@/components/icons/google-drive";
import { NotionIcon } from "@/components/icons/notion";

import { garet } from "./fonts";
import "./landing.css";
import { DesignEditorMockup } from "./_components/design-editor-mockup";
import { HeroPipeline } from "./_components/hero-pipeline";
import { IgnisMark } from "./_components/ignis-mark";
import { LandingHeader } from "./_components/landing-header";
import { Reveal } from "./_components/reveal";
import { RunMockup } from "./_components/run-mockup";
import { GITHUB_URL } from "./_components/site";
import { WaitlistForm } from "./_components/waitlist-form";
import { WorkflowMockup } from "./_components/workflow-mockup";

export const metadata: Metadata = {
  title: "Ignis — design once, render forever",
  description:
    "Ignis is an open-source studio that pairs a design template editor with a general-purpose workflow engine. Draw designs with placeholders, automate any process with AI steps, branching, and human review — and render on-brand images into Google Drive and Notion.",
};

/** The three product tour stops, in the order a real pipeline executes. */
const TOUR = [
  {
    id: "design",
    step: "S1",
    kicker: "Design",
    title: "A canvas where placeholders are first-class",
    lede: "Everything you expect from a design editor — shapes, text, images, multi-page documents, brand kits. And one thing you don't: any layer can be named as a placeholder, which turns your design into a function your workflows can call.",
    mockup: <DesignEditorMockup />,
    features: [
      {
        title: "Placeholder layers",
        desc: (
          <>
            Give a text layer the key{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              title
            </code>{" "}
            and every run fills it with live data. Image placeholders work the
            same way.
          </>
        ),
      },
      {
        title: "Multi-page templates",
        desc: "Carousels and series live in one template — every page renders in a single pass.",
      },
      {
        title: "Export anywhere",
        desc: "Download finished art as PNG, or take the template itself as a React component or HTML.",
      },
    ],
  },
  {
    id: "automate",
    step: "S2",
    kicker: "Automate",
    title: "Wire steps around the template",
    lede: "Start from a webhook. Let AI find, rank, and curate images. Branch with routers, pause for a human pick — then render. Every step speaks the same token language, so any output can feed any placeholder.",
    mockup: <WorkflowMockup />,
    features: [
      {
        title: "AI in the loop",
        desc: "Rank and categorize photos with vision models, or call any LLM with your own prompt — using your own API keys.",
      },
      {
        title: "Branches and gates",
        desc: "Routers take conditional paths; manual review pauses a run until a human approves or picks.",
      },
      {
        title: "Plain-token bindings",
        desc: (
          <>
            Map any step&apos;s output into any input with tokens like{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {"{{S3.best.title}}"}
            </code>
            . No glue code.
          </>
        ),
      },
    ],
  },
  {
    id: "runs",
    step: "S3",
    kicker: "Run",
    title: "Runs you can watch — and trust",
    lede: "Every run executes durably and streams back live: per-step status, logs as they happen, pages as they render. Stop it, review it, or let it finish straight into Google Drive or Notion.",
    mockup: <RunMockup />,
    features: [
      {
        title: "Live, step by step",
        desc: "Statuses, logs, and outputs stream into the run view in real time — no refresh, no guessing.",
      },
      {
        title: "Durable by design",
        desc: "Runs survive restarts and reconnects, retry transient failures, and pick up exactly where they left off.",
      },
      {
        title: "Every render kept",
        desc: "Each run keeps its rendered pages and full logs, so you can audit what shipped and why.",
      },
    ],
  },
];

const NODE_CATALOG = [
  { group: "Trigger", nodes: ["Webhook"] },
  { group: "Media", nodes: ["Find Location Images", "Curate Images", "Rehost Image"] },
  { group: "AI", nodes: ["Rank Images", "Categorize Images", "LLM Prompt"] },
  {
    group: "Design",
    nodes: [
      "Render Template",
      "Render Template Batch",
      "Preview Design Image",
      "Review Designs",
    ],
  },
  { group: "Flow", nodes: ["Manual Review", "Router"] },
  { group: "Google Drive", nodes: ["List Drive Images", "Upload Drive Files"] },
  { group: "Notion", nodes: ["Update Notion Page"] },
  { group: "Utility", nodes: ["Sync Link Hub", "Run Link"] },
];

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-6 min-w-9 items-center justify-center rounded-md bg-ember/15 px-1.5 font-mono text-[11px] font-semibold text-ember">
      {children}
    </span>
  );
}

function SectionHeader({
  step,
  kicker,
  title,
  lede,
}: {
  step: React.ReactNode;
  kicker: string;
  title: string;
  lede: string;
}) {
  return (
    <Reveal>
      <div className="flex items-center gap-2.5">
        <StepBadge>{step}</StepBadge>
        <span className="text-sm font-medium text-muted-foreground">
          {kicker}
        </span>
      </div>
      <h2 className="font-display mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {lede}
      </p>
    </Reveal>
  );
}

export default function LandingPage() {
  return (
    <div className={`${garet.variable} min-h-svh bg-background text-foreground`}>
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-14 lg:grid-cols-[1fr_auto] lg:gap-20 lg:py-16">
            <div>
              <h1 className="font-display mt-6 text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
                Design once.
                <br />
                Render forever<span className="text-ember">.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Ignis puts a template editor and a workflow engine on the same
                canvas. Draw a design with placeholders and every trigger
                renders finished, on-brand images into Google Drive or Notion —
                or skip the canvas and automate any process with AI steps,
                branching, and human review.
              </p>
              <div className="mt-8">
                <WaitlistForm />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                One email when the hosted beta opens. Prefer self-hosting?{" "}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  It&apos;s open source
                </a>
                .
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <HeroPipeline />
            </div>
          </div>
        </section>

        {/* Product tour: S1 Design → S2 Automate → S3 Run */}
        {TOUR.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-20 border-t border-border"
          >
            <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
              <SectionHeader
                step={section.step}
                kicker={section.kicker}
                title={section.title}
                lede={section.lede}
              />
              <Reveal delay={100} className="mt-12">
                {section.mockup}
              </Reveal>
              <div className="mt-10 grid gap-8 sm:grid-cols-3">
                {section.features.map((feature) => (
                  <div key={feature.title} className="border-t border-border pt-4">
                    <h3 className="text-sm font-semibold">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* Step catalog */}
        <section id="steps" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <SectionHeader
              step="18"
              kicker="Step catalog"
              title="Every step speaks the same language"
              lede="Eighteen steps today, growing with each release. Triggers, media, AI, design, flow control, and destinations — all bound together with plain tokens."
            />
            <Reveal delay={100}>
              <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
                {NODE_CATALOG.map((group) => (
                  <div key={group.group}>
                    <h3 className="flex items-baseline justify-between gap-2 border-b border-border pb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {group.group}
                      <span className="tabular-nums text-muted-foreground/60">
                        {group.nodes.length}
                      </span>
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {group.nodes.map((node) => (
                        <li key={node} className="text-sm">
                          {node}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Connections */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <SectionHeader
              step="BYO"
              kicker="Connections"
              title="Bring your own keys"
              lede="OAuth for Google Drive; API keys for Notion and your AI providers. Connections live on your instance and nowhere else."
            />
            <Reveal delay={100}>
              <div className="mt-10 flex flex-wrap gap-3">
                <span className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm">
                  <GoogleDriveIcon className="size-4" />
                  Google Drive
                </span>
                <span className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm">
                  <NotionIcon className="size-4" />
                  Notion
                </span>
                {["OpenAI", "Anthropic", "Azure AI Foundry"].map((name) => (
                  <span
                    key={name}
                    className="flex items-center rounded-full border border-border px-4 py-2 text-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Waitlist CTA */}
        <section id="waitlist" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl border border-border px-6 py-16 text-center sm:px-12">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(65% 90% at 50% 0%, color-mix(in oklch, var(--ember), transparent 86%), transparent 70%)",
                  }}
                />
                <div className="relative flex flex-col items-center gap-6">
                  <IgnisMark className="size-10 rounded-xl" iconClassName="size-5" />
                  <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
                    Be there when it ignites
                    <span className="text-ember">.</span>
                  </h2>
                  <p className="max-w-xl text-muted-foreground">
                    Ignis is early and moving fast. Join the waitlist for the
                    hosted beta — or clone the repo and run it tonight.
                  </p>
                  <WaitlistForm className="justify-center sm:w-auto" />
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Star on GitHub
                    <ArrowUpRight className="ml-0.5 inline size-3.5" />
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <IgnisMark className="size-5 rounded-[6px]" iconClassName="size-3" />
            <span className="text-sm text-muted-foreground">
              Ignis — open-source design &amp; workflow automation
            </span>
          </div>
          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
