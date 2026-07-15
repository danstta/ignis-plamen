"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Blocks,
  ChevronRight,
  CircleUser,
  FolderPlus,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Search,
  Settings,
  SunMoon,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  persistSidebarPrefs,
  type SidebarPrefs,
} from "@/lib/sidebar-prefs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openCommandPalette } from "@/components/command/command-palette";
import { FolderSidebarList } from "@/components/folders/folder-sidebar-list";
import { NewFolderPopover } from "@/components/folders/new-folder-popover";
import type { Asset } from "@/lib/assets/types";
import type { FolderSummary } from "@/lib/folders/types";

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

type SectionKey = "design" | "workflows";

/** Which sidebar section a path belongs to, or null for shared routes. */
function sectionForPath(pathname: string): SectionKey | null {
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
  assets,
  initialPrefs,
}: {
  templates: SidebarTemplate[];
  workflows: SidebarWorkflow[];
  designFolders: FolderSummary[];
  workflowFolders: FolderSummary[];
  assets: Asset[];
  initialPrefs: SidebarPrefs;
}) {
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<SidebarPrefs>(initialPrefs);

  // The cookie makes the next server render match the client, so there is
  // never a flash of the wrong layout on load.
  useEffect(() => {
    persistSidebarPrefs(prefs);
  }, [prefs]);

  const toggleCollapsed = useCallback(() => {
    setPrefs((current) => ({ ...current, collapsed: !current.collapsed }));
  }, []);

  const toggleSection = useCallback((section: SectionKey) => {
    setPrefs((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  // Navigating into a section's route opens that section so the active link
  // is always visible. Adjusting state during render — rather than in an
  // effect — avoids an extra commit and cascading renders.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    const section = sectionForPath(pathname);
    if (section && !prefs[section]) {
      setPrefs((current) => ({ ...current, [section]: true }));
    }
  }

  // Toggle collapse with ⌘B / Ctrl+B, matching the buttons' tooltips.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  // Settings takes over the whole sidebar — its own nav plus a way back —
  // rather than rendering as a page inside the main content area.
  const isSettings = pathname.startsWith("/settings");
  const collapsed = !isSettings && prefs.collapsed;

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        // Hidden on small screens, where MobileNav provides navigation.
        "hidden h-svh w-64 shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground md:flex",
        "transition-[width] duration-200 ease-in-out data-collapsed:w-14",
      )}
    >
      {isSettings ? (
        <SettingsSidebar />
      ) : collapsed ? (
        <CollapsedRail onExpand={toggleCollapsed} />
      ) : (
        <ExpandedSidebar
          templates={templates}
          workflows={workflows}
          designFolders={designFolders}
          workflowFolders={workflowFolders}
          assets={assets}
          prefs={prefs}
          onToggleSection={toggleSection}
          onCollapse={toggleCollapsed}
        />
      )}
    </aside>
  );
}

function ExpandedSidebar({
  templates,
  workflows,
  designFolders,
  workflowFolders,
  assets,
  prefs,
  onToggleSection,
  onCollapse,
}: {
  templates: SidebarTemplate[];
  workflows: SidebarWorkflow[];
  designFolders: FolderSummary[];
  workflowFolders: FolderSummary[];
  assets: Asset[];
  prefs: SidebarPrefs;
  onToggleSection: (section: SectionKey) => void;
  onCollapse: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Dashboard lives at "/", so it can't use the prefix match above (everything
  // starts with "/") — it's active only on an exact match.
  const isDashboard = pathname === "/";

  return (
    <div className="flex h-full w-64 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide text-muted-foreground">
          Ignis
        </span>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse sidebar (Ctrl+B)"
          aria-label="Collapse sidebar"
          className={iconButtonClass("size-8")}
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <SearchButton />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col px-3 pb-3">
          <div className="flex flex-col gap-0.5 pt-3">
            <SidebarLink
              href="/"
              active={isDashboard}
              icon={<LayoutDashboard className="size-4 shrink-0" />}
            >
              Dashboard
            </SidebarLink>
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

          <SidebarSection
            label="Designs"
            open={prefs.design}
            onToggle={() => onToggleSection("design")}
            action={
              <>
                <Link
                  href="/editor/new"
                  title="New design"
                  aria-label="New design"
                  className={iconButtonClass("size-6")}
                >
                  <Plus className="size-3.5" />
                </Link>
                <NewFolderPopover
                  kind="design"
                  trigger={
                    <button
                      type="button"
                      title="New design folder"
                      aria-label="New design folder"
                      className={iconButtonClass("size-6")}
                    >
                      <FolderPlus className="size-3.5" />
                    </button>
                  }
                />
              </>
            }
          >
            <FolderSidebarList
              kind="design"
              folders={designFolders}
              assets={assets}
              items={templates.map((t) => ({
                id: t.id,
                name: t.name,
                folderId: t.folderId,
                href: `/editor/${t.id}`,
                active: isActive(`/editor/${t.id}`),
              }))}
            />
          </SidebarSection>

          <SidebarSection
            label="Workflows"
            open={prefs.workflows}
            onToggle={() => onToggleSection("workflows")}
            action={
              <>
                <Link
                  href="/workflows/new"
                  title="New workflow"
                  aria-label="New workflow"
                  className={iconButtonClass("size-6")}
                >
                  <Plus className="size-3.5" />
                </Link>
                <NewFolderPopover
                  kind="workflow"
                  trigger={
                    <button
                      type="button"
                      title="New workflow folder"
                      aria-label="New workflow folder"
                      className={iconButtonClass("size-6")}
                    >
                      <FolderPlus className="size-3.5" />
                    </button>
                  }
                />
              </>
            }
          >
            <FolderSidebarList
              kind="workflow"
              folders={workflowFolders}
              assets={assets}
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
          </SidebarSection>
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <SidebarLink
          href="/settings"
          active={isActive("/settings")}
          icon={<Settings className="size-4 shrink-0" />}
        >
          Settings
        </SidebarLink>
      </div>
    </div>
  );
}

/**
 * Collapsible nav group. The header row toggles the group; hover/focus
 * reveals the group's action (e.g. "new folder").
 */
function SidebarSection({
  label,
  open,
  onToggle,
  action,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="group/section flex items-center gap-0.5 pt-4 pb-1 pr-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium tracking-wide text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="truncate">{label}</span>
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
        {action ? (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100">
            {action}
          </div>
        ) : null}
      </div>
      {open ? <div className="flex flex-col gap-0.5">{children}</div> : null}
    </div>
  );
}

/** Field-styled button that opens the ⌘K command palette. */
function SearchButton() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md bg-sidebar-accent/60 px-2.5 text-sm text-muted-foreground outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
      )}
    >
      <Search className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">Search</span>
      <kbd className="pointer-events-none font-sans text-[10px] font-medium text-muted-foreground/60">
        Ctrl K
      </kbd>
    </button>
  );
}

/** Shared "create" actions, used by the expanded sidebar and the rail. */
function CreateMenuContent({
  side = "bottom",
  align = "start",
}: {
  side?: "bottom" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenuContent side={side} align={align} className="min-w-48">
      <DropdownMenuItem render={<Link href="/editor/new" />}>
        <LayoutTemplate className="text-muted-foreground" /> New design
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/workflows/new" />}>
        <Workflow className="text-muted-foreground" /> New workflow
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Icon-only rail shown when collapsed: quick nav with tooltips. */
function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const isDashboard = pathname === "/";

  return (
    <TooltipProvider delay={300}>
      <div className="flex h-full w-14 flex-col items-center">
        <div className="flex h-14 shrink-0 items-center justify-center border-b self-stretch">
          <RailTooltip label="Expand sidebar (Ctrl+B)">
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand sidebar"
              className={railClass()}
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </RailTooltip>
        </div>

        <div className="flex flex-col items-center gap-1 pt-3">
          <RailTooltip label="Search (Ctrl+K)">
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="Search"
              className={railClass()}
            >
              <Search className="size-4" />
            </button>
          </RailTooltip>
          <DropdownMenu>
            <RailTooltip label="Create">
              <DropdownMenuTrigger aria-label="Create" className={railClass()}>
                <Plus className="size-4" />
              </DropdownMenuTrigger>
            </RailTooltip>
            <CreateMenuContent side="right" />
          </DropdownMenu>
          <RailLink
            href="/"
            active={isDashboard}
            label="Dashboard"
            icon={<LayoutDashboard className="size-4" />}
          />
        </div>

        <RailDivider />

        <div className="flex flex-col items-center gap-1">
          <RailLink
            href="/brand"
            active={isActive("/brand")}
            label="Brand"
            icon={<Palette className="size-4" />}
          />
          <RailLink
            href="/assets"
            active={isActive("/assets")}
            label="Assets"
            icon={<Images className="size-4" />}
          />
        </div>

        <RailDivider />

        <div className="flex flex-col items-center gap-1">
          <RailLink
            href="/runs"
            active={isActive("/runs")}
            label="Runs"
            icon={<Activity className="size-4" />}
          />
          <RailLink
            href="/plugins"
            active={isActive("/plugins")}
            label="Plugins"
            icon={<Blocks className="size-4" />}
          />
        </div>

        <div className="mt-auto pb-3">
          <RailLink
            href="/settings"
            active={isActive("/settings")}
            label="Settings"
            icon={<Settings className="size-4" />}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function RailDivider() {
  return <div className="my-2 h-px w-6 shrink-0 bg-border" />;
}

function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <RailTooltip label={label}>
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={railClass(active)}
      >
        {icon}
      </Link>
    </RailTooltip>
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
    <div className="flex h-full w-64 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Link
          href="/"
          aria-label="Back to app"
          title="Back to app"
          className={iconButtonClass("size-8")}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span className="text-sm font-semibold tracking-tight">Settings</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          <SectionLabel>Workspace</SectionLabel>
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
    </div>
  );
}

function iconButtonClass(size: string) {
  return cn(
    "flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    size,
  );
}

function railClass(active?: boolean) {
  return cn(
    iconButtonClass("size-9"),
    active && "bg-sidebar-accent text-sidebar-accent-foreground",
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
        "data-active:font-medium data-active:text-sidebar-foreground",
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
