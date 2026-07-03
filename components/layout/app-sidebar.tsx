"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Blocks,
  CircleUser,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Settings,
  SunMoon,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderSidebarList } from "@/components/folders/folder-sidebar-list";
import type { FolderSummary } from "@/lib/folders/types";

type Mode = "design" | "workflows";

export type SidebarTemplate = {
  id: string;
  name: string;
  folderId: string | null;
};
export type SidebarWorkflow = {
  id: string;
  name: string;
  folderId: string | null;
  active: boolean;
};

/** Which mode a path belongs to, or null for shared routes (dashboard, settings). */
function inferMode(pathname: string): Mode | null {
  if (
    pathname.startsWith("/workflows") ||
    pathname.startsWith("/runs") ||
    pathname.startsWith("/plugins")
  ) {
    return "workflows";
  }
  if (
    pathname.startsWith("/templates") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/editor")
  ) {
    return "design";
  }
  return null;
}

export function AppSidebar({
  templates,
  workflows,
  designFolders,
  workflowFolders,
}: {
  templates: SidebarTemplate[];
  workflows: SidebarWorkflow[];
  designFolders: FolderSummary[];
  workflowFolders: FolderSummary[];
}) {
  const pathname = usePathname();

  // Settings takes over the whole sidebar — its own nav plus a way back —
  // rather than rendering as a page inside the main content area.
  if (pathname.startsWith("/settings")) {
    return <SettingsSidebar />;
  }

  return (
    <MainSidebar
      templates={templates}
      workflows={workflows}
      designFolders={designFolders}
      workflowFolders={workflowFolders}
    />
  );
}

const COLLAPSE_KEY = "sidebar-collapsed";
const COLLAPSE_EVENT = "sidebar-collapsed-change";

function subscribeCollapsed(cb: () => void) {
  // Same-tab toggles fire a custom event; `storage` syncs across tabs.
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Collapsed/expanded state for the global sidebar, persisted across sessions.
 * Read via useSyncExternalStore so the server snapshot (expanded) is used during
 * hydration — no localStorage access on the server, no hydration mismatch.
 */
function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );
  const toggle = useCallback(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, [collapsed]);
  return [collapsed, toggle];
}

function MainSidebar({
  templates,
  workflows,
  designFolders,
  workflowFolders,
}: {
  templates: SidebarTemplate[];
  workflows: SidebarWorkflow[];
  designFolders: FolderSummary[];
  workflowFolders: FolderSummary[];
}) {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>(() => inferMode(pathname) ?? "design");
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  // Keep the visible mode in sync when navigating into a moded route, while
  // still letting the user switch modes manually (e.g. to browse the other
  // list before navigating). Adjusting state during render — rather than in an
  // effect — avoids an extra commit and cascading renders.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    const next = inferMode(pathname);
    if (next) setMode(next);
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Dashboard lives at "/", so it can't use the prefix match above (everything
  // starts with "/") — it's active only on an exact match.
  const isDashboard = pathname === "/";

  if (collapsed) {
    return (
      <CollapsedRail
        mode={mode}
        setMode={setMode}
        onExpand={toggleCollapsed}
        isActive={isActive}
        isDashboard={isDashboard}
      />
    );
  }

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-3 pt-4">
        <div className="flex gap-1 rounded-lg bg-muted">
          <ModeButton
            active={mode === "design"}
            onClick={() => setMode("design")}
            icon={<LayoutTemplate className="size-4" />}
          >
            Design
          </ModeButton>
          <ModeButton
            active={mode === "workflows"}
            onClick={() => setMode("workflows")}
            icon={<Workflow className="size-4" />}
          >
            Workflows
          </ModeButton>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-3 pt-2">
        <SidebarLink
          href="/"
          active={isDashboard}
          icon={<LayoutDashboard className="size-4 shrink-0" />}
        >
          Dashboard
        </SidebarLink>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {mode === "design" ? (
            <>
              <Button
                variant="secondary"
                className="w-full justify-start"
                render={<Link href="/editor/new" />}
              >
                <Plus /> New design
              </Button>

              <div className="mt-2 flex flex-col gap-0.5">
                <SidebarLink
                  href="/brand"
                  active={isActive("/brand")}
                  icon={<Palette className="size-4 shrink-0" />}
                >
                  Brand
                </SidebarLink>
                <SidebarLink
                  href="/assets"
                  active={isActive("/assets")}
                  icon={<Images className="size-4 shrink-0" />}
                >
                  Assets
                </SidebarLink>
              </div>

              <FolderSidebarList
                kind="design"
                folders={designFolders}
                items={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  folderId: t.folderId,
                  href: `/editor/${t.id}`,
                  active: isActive(`/editor/${t.id}`),
                }))}
              />
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="w-full justify-start"
                render={<Link href="/workflows/new" />}
              >
                <Plus /> New workflow
              </Button>

              <div className="mt-2 flex flex-col gap-0.5">
                <SidebarLink
                  href="/runs"
                  active={isActive("/runs")}
                  icon={<Activity className="size-4 shrink-0" />}
                >
                  Runs
                </SidebarLink>
                <SidebarLink
                  href="/plugins"
                  active={isActive("/plugins")}
                  icon={<Blocks className="size-4 shrink-0" />}
                >
                  Plugins
                </SidebarLink>
              </div>

              <FolderSidebarList
                kind="workflow"
                folders={workflowFolders}
                items={workflows.map((w) => ({
                  id: w.id,
                  name: w.name,
                  folderId: w.folderId,
                  href: `/workflows/${w.id}`,
                  active: isActive(`/workflows/${w.id}`),
                  trailing: (
                    <span
                      title={w.active ? "Active" : "Inactive"}
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        w.active ? "bg-green-500" : "bg-muted-foreground/40",
                      )}
                    />
                  ),
                }))}
              />
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-1 p-3">
        <div className="min-w-0 flex-1">
          <SidebarLink
            href="/settings"
            active={isActive("/settings")}
            icon={<Settings className="size-4 shrink-0" />}
          >
            Settings
          </SidebarLink>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
    </aside>
  );
}

/** Icon-only sidebar shown when collapsed: quick nav plus an expand toggle. */
function CollapsedRail({
  mode,
  setMode,
  onExpand,
  isActive,
  isDashboard,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  onExpand: () => void;
  isActive: (href: string) => boolean;
  isDashboard: boolean;
}) {
  return (
    <aside className="flex h-svh w-14 shrink-0 flex-col items-center border-r bg-sidebar py-4 text-sidebar-foreground">
      <div className="flex flex-col gap-1">
        <RailButton
          title="Design"
          active={mode === "design"}
          onClick={() => setMode("design")}
          icon={<LayoutTemplate className="size-4" />}
        />
        <RailButton
          title="Workflows"
          active={mode === "workflows"}
          onClick={() => setMode("workflows")}
          icon={<Workflow className="size-4" />}
        />
      </div>

      <div className="my-2 h-px w-6 bg-border" />

      <div className="flex flex-col items-center gap-1">
        <RailLink
          href="/"
          active={isDashboard}
          title="Dashboard"
          icon={<LayoutDashboard className="size-4" />}
        />
      </div>

      <div className="my-2 h-px w-6 bg-border" />

      <div className="flex flex-col gap-1">
        <RailLink
          href={mode === "design" ? "/editor/new" : "/workflows/new"}
          title={mode === "design" ? "New design" : "New workflow"}
          icon={<Plus className="size-4" />}
        />
        {mode === "design" ? (
          <>
            <RailLink
              href="/brand"
              active={isActive("/brand")}
              title="Brand"
              icon={<Palette className="size-4" />}
            />
            <RailLink
              href="/assets"
              active={isActive("/assets")}
              title="Assets"
              icon={<Images className="size-4" />}
            />
          </>
        ) : (
          <>
            <RailLink
              href="/runs"
              active={isActive("/runs")}
              title="Runs"
              icon={<Activity className="size-4" />}
            />
            <RailLink
              href="/plugins"
              active={isActive("/plugins")}
              title="Plugins"
              icon={<Blocks className="size-4" />}
            />
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailLink
          href="/settings"
          active={isActive("/settings")}
          title="Settings"
          icon={<Settings className="size-4" />}
        />
        <RailButton
          title="Expand sidebar"
          onClick={onExpand}
          icon={<PanelLeftOpen className="size-4" />}
        />
      </div>
    </aside>
  );
}

function railClass(active?: boolean) {
  return cn(
    "flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    active && "bg-sidebar-accent text-sidebar-accent-foreground",
  );
}

function RailButton({
  title,
  active,
  onClick,
  icon,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={railClass(active)}
    >
      {icon}
    </button>
  );
}

function RailLink({
  href,
  title,
  active,
  icon,
}: {
  href: string;
  title: string;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      className={railClass(active)}
    >
      {icon}
    </Link>
  );
}

function SettingsSidebar() {
  const pathname = usePathname();
  // Each settings item is its own panel, so exact-match the active route…
  const isActive = (href: string) => pathname === href;
  // …except Connections, which has detail sub-routes.
  const isSection = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          <SectionLabel>Settings</SectionLabel>
          <SidebarLink
            href="/settings"
            active={isActive("/settings")}
            icon={<SunMoon className="size-4 shrink-0" />}
          >
            Appearance
          </SidebarLink>
          <SidebarLink
            href="/settings/connections"
            active={isSection("/settings/connections")}
            icon={<Plug className="size-4 shrink-0" />}
          >
            Connections
          </SidebarLink>

          <SectionLabel>Account</SectionLabel>
          <SidebarLink
            href="/settings/account"
            active={isActive("/settings/account")}
            icon={<CircleUser className="size-4 shrink-0" />}
          >
            Account
          </SidebarLink>
        </div>
      </ScrollArea>

      <div className="p-3">
        <SidebarLink
          href="/"
          active={false}
          icon={<ArrowLeft className="size-4 shrink-0" />}
        >
          Back
        </SidebarLink>
      </div>
    </aside>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-active={active || undefined}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all outline-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        "data-active:bg-background data-active:text-foreground data-active:shadow-sm",
        "data-active:bg-input/30",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  children,
  trailing,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}

