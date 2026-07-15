import {
  ArrowRight,
  LayoutTemplate,
  Palette,
  Workflow,
  Plug,
  Activity,
  Code2,
  Type,
  Image as ImageIcon,
  Shapes,
  Braces,
  GitBranch,
  ScanEye,
  MapPin,
  FileUp,
  Webhook,
  Sparkles,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LandingHeader } from "./_components/landing-header";
import { EditorMockup } from "./_components/editor-mockup";
import { WorkflowMockup } from "./_components/workflow-mockup";

export const metadata = {
  title: "Ignis — Design templates. Automate everything.",
  description:
    "Ignis is a visual automation platform that combines design templating with workflow automation. Think Canva and Zapier in one tool.",
};

const FEATURES = [
  {
    icon: LayoutTemplate,
    title: "Template Designer",
    description:
      "A canvas-based visual editor for creating design templates. Drag, resize, and rotate text, images, and shapes with snap guides and multi-page support.",
    points: [
      "Text, images, shapes, gradients",
      "Auto-width chips and fit-to-box text",
      "Server-side PNG rendering via Satori",
    ],
  },
  {
    icon: Palette,
    title: "Brand Management",
    description:
      "Define reusable brand identities — colors, fonts, logos — that appear in every color picker and font selector across the editor.",
    points: [
      "Brand color swatches everywhere",
      "Custom font registration",
      "One-click brand logo insertion",
    ],
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    description:
      "A visual workflow canvas built on React Flow. Chain nodes together to fetch data, process images, call AI models, and render designs — all stored as graphs in PostgreSQL.",
    points: [
      "Webhook triggers",
      "Conditional routing with branches",
      "Manual review pauses for human input",
    ],
  },
  {
    icon: Plug,
    title: "Connections",
    description:
      "An OAuth 2.0 integration framework for third-party services. Connect your accounts once and reference them from any workflow node.",
    points: [
      "Google Drive — OAuth 2.0",
      "Notion — API key authentication",
      "OpenAI / Azure AI Foundry",
    ],
  },
  {
    icon: Activity,
    title: "Background Job Execution",
    description:
      "Durable workflow execution via Inngest. Retries, memoization, and concurrency limiting keep runs reliable — completed steps are never re-run on retry.",
    points: [
      "Live run status streaming",
      "Automatic retries with memoization",
      "Max 10 parallel runs",
    ],
  },
  {
    icon: Code2,
    title: "Code Export",
    description:
      "Export any template as a production-ready React component or standalone HTML. The design you build in the editor is the code you ship.",
    points: [
      "React component (.tsx) export",
      "HTML (.html) export",
      "PNG image export (all pages)",
    ],
  },
];

const WORKFLOW_NODES = [
  { icon: Webhook, label: "Webhook", group: "Trigger" },
  { icon: MapPin, label: "Find Location Images", group: "Media" },
  { icon: ScanEye, label: "Rank Images", group: "AI" },
  { icon: ImageIcon, label: "Curate Images", group: "Media" },
  { icon: LayoutTemplate, label: "Render Template", group: "Design" },
  { icon: FileUp, label: "Upload Drive Files", group: "Google Drive" },
];

const STEPS = [
  {
    number: "01",
    title: "Design a template",
    description:
      "Open the visual editor and build a design with placeholders. Drop in text chips, image frames, and shapes — then bind each one to a key like title or background. Your brand colors and fonts are right there in every picker.",
  },
  {
    number: "02",
    title: "Wire a workflow",
    description:
      "In the workflow editor, add a trigger and chain nodes together. Fetch images near a location, rank them with AI vision, pause for a human pick, fill the template, and upload the result to Google Drive — all visually connected.",
  },
  {
    number: "03",
    title: "Automate at scale",
    description:
      "Activate the workflow. Every incoming webhook kicks off a durable run that streams its status live to the dashboard. Retries and memoization mean failures pick up where they left off — no re-rendering from scratch.",
  },
];

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-svh bg-background">
      <LandingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Subtle grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge>
              <Sparkles className="size-3" />
              Open source • Early access
            </Badge>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Design templates.
              <br />
              Automate everything.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
              Ignis is a visual automation platform that combines design
              templating with workflow automation. Think Canva and Zapier in one
              tool — built for teams that generate dynamic, branded assets at
              scale.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                render={
                  <a
                    href="https://github.com/danstta/ignis"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                View on GitHub
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Editor mockup */}
          <div className="mx-auto mt-16 max-w-4xl">
            <EditorMockup />
          </div>
        </div>
      </section>

      {/* What is Ignis */}
      <section className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                What is Ignis
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Canva meets Zapier for branded content at scale
              </h2>
              <p className="mt-5 text-base text-muted-foreground">
                Most teams juggle a design tool, an automation platform, and a
                pile of scripts to bridge them. Ignis collapses that into one
                app: design a template once, wire a workflow that fills it with
                live data, and let it run.
              </p>
              <p className="mt-4 text-base text-muted-foreground">
                Build a poster template with placeholders for a location name
                and a hero image. Connect a webhook that receives a city. The
                workflow finds real photos, ranks them with AI vision, renders
                the template, and uploads the result to Google Drive —
                automatically, every time.
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {[
                  "Visual template editor with brand colors and fonts",
                  "Node-based workflow canvas with 15+ node types",
                  "Server-side PNG rendering — no browser needed",
                  "Live run streaming with retries and memoization",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="size-3" />
                    </span>
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Quick stats / highlights card */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "15+", label: "Workflow node types", icon: Workflow },
                { value: "3", label: "Canvas element types", icon: Shapes },
                { value: "1", label: "Click to render PNG", icon: LayoutTemplate },
                { value: "∞", label: "Runs per workflow", icon: Activity },
              ].map((stat) => (
                <Card key={stat.label} className="gap-2 p-5">
                  <stat.icon className="size-5 text-muted-foreground" />
                  <span className="text-3xl font-semibold tabular-nums">
                    {stat.value}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Design Editor showcase */}
      <section
        id="design"
        className="border-t border-border bg-muted/30 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Design Editor"
            title="A canvas editor that feels like Canva"
            description="Drag, resize, and rotate elements on an infinite canvas. Add text chips, image frames, and shapes. Bind any element to a placeholder key so the workflow can fill it in later."
          />

          <div className="mx-auto mt-14 max-w-4xl">
            <EditorMockup />
          </div>

          {/* Feature bullets under the mockup */}
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              {
                icon: Type,
                title: "Text & chips",
                desc: "Fixed text, placeholders, auto-width chips, and fit-to-box auto-sizing.",
              },
              {
                icon: ImageIcon,
                title: "Images & assets",
                desc: "Object-fit controls, rounded corners, ellipse clipping, and a built-in asset library.",
              },
              {
                icon: Shapes,
                title: "Shapes & gradients",
                desc: "Rectangles, ellipses, triangles, stars, arrows — with solid and gradient fills.",
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Editor showcase */}
      <section
        id="workflows"
        className="border-t border-border py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Workflow Editor"
            title="A node canvas that wires everything together"
            description="Start from a webhook trigger and chain nodes to fetch images, rank them with AI, pause for a human review, render a template, and upload the result. Conditions, branches, and loops — all visual."
          />

          <div className="mx-auto mt-14 max-w-4xl">
            <WorkflowMockup />
          </div>

          {/* Node flow strip */}
          <div className="mx-auto mt-10 max-w-4xl">
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              A typical workflow
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {WORKFLOW_NODES.map((node, i) => (
                <div key={node.label} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
                    <node.icon className="size-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{node.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {node.group}
                      </span>
                    </div>
                  </div>
                  {i < WORKFLOW_NODES.length - 1 ? (
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground/40" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section
        id="features"
        className="border-t border-border bg-muted/30 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything in one place"
            description="From the pixel-perfect editor to the durable execution engine, every piece is designed to work together."
          />

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="h-full gap-4 p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
                <ul className="mt-auto flex flex-col gap-1.5">
                  {feature.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="size-3 shrink-0 text-foreground" />
                      {point}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-border py-20 sm:py-28"
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="How it works"
            title="From template to automation in three steps"
          />

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative flex flex-col gap-4">
                {i < STEPS.length - 1 ? (
                  <div className="absolute left-6 top-12 hidden h-[calc(100%-1rem)] w-px bg-border lg:block" />
                ) : null}
                <div className="flex size-12 items-center justify-center rounded-xl bg-foreground text-background">
                  <span className="text-sm font-semibold tabular-nums">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          {/* Node types reference */}
          <div className="mt-16 rounded-xl border border-border bg-muted/30 p-6">
            <h3 className="text-sm font-semibold">Available workflow nodes</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Every node is a self-contained step with typed inputs, outputs, and
              a config schema. Add new ones by implementing the contract and
              registering them.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { label: "Webhook", icon: Webhook, group: "Trigger" },
                { label: "Find Location Images", icon: MapPin, group: "Media" },
                { label: "Rank Images", icon: ScanEye, group: "AI" },
                { label: "Curate Images", icon: ImageIcon, group: "Media" },
                { label: "Rehost Image", icon: FileUp, group: "Media" },
                { label: "LLM Prompt", icon: Sparkles, group: "AI" },
                { label: "Render Template", icon: LayoutTemplate, group: "Design" },
                { label: "Render Template Batch", icon: LayoutTemplate, group: "Design" },
                { label: "Review Designs", icon: ScanEye, group: "Design" },
                { label: "Manual Review", icon: Check, group: "Flow" },
                { label: "Router", icon: GitBranch, group: "Flow" },
                { label: "Update Notion Page", icon: Braces, group: "Notion" },
                { label: "List Drive Images", icon: ImageIcon, group: "Google Drive" },
                { label: "Upload Drive Files", icon: FileUp, group: "Google Drive" },
                { label: "Run Link", icon: Activity, group: "Utility" },
              ].map((node) => (
                <span
                  key={node.label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  <node.icon className="size-3.5 text-muted-foreground" />
                  {node.label}
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground">{node.group}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-foreground py-20 text-background sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Start automating your design workflow
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-background/70">
            Ignis is open source and ready to self-host. Clone the repo, set your
            environment variables, and start building.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
              render={
                <a
                  href="https://github.com/danstta/ignis"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              View on GitHub
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
                <span className="text-sm font-bold">I</span>
              </div>
              <span className="text-base font-semibold tracking-tight">Ignis</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Open source under MIT. Built with Next.js, Drizzle, and Inngest.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/danstta/ignis"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
