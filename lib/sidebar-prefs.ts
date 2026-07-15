/**
 * Sidebar layout preferences (collapsed rail, open sections), persisted in a
 * cookie rather than localStorage so the server can render the correct state
 * on first paint — no hydration mismatch and no flash of the wrong layout.
 * The admin layout reads the cookie and passes the parsed prefs to the
 * sidebar; the sidebar writes the cookie back whenever the user changes them.
 */

export type SidebarPrefs = {
  /** Sidebar shown as the icon-only rail. */
  collapsed: boolean;
  /** "Design" section expanded. */
  design: boolean;
  /** "Workflows" section expanded. */
  workflows: boolean;
};

export const SIDEBAR_PREFS_COOKIE = "sidebar-prefs";

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = {
  collapsed: false,
  design: true,
  workflows: true,
};

/** Parse the raw cookie value, tolerating missing or corrupt data. */
export function parseSidebarPrefs(raw: string | undefined): SidebarPrefs {
  if (!raw) return DEFAULT_SIDEBAR_PREFS;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_SIDEBAR_PREFS;
    }
    const prefs = parsed as Record<string, unknown>;
    return {
      collapsed: prefs.collapsed === true,
      design: prefs.design !== false,
      workflows: prefs.workflows !== false,
    };
  } catch {
    return DEFAULT_SIDEBAR_PREFS;
  }
}

/** Client-side: persist prefs so the next server render matches. */
export function persistSidebarPrefs(prefs: SidebarPrefs) {
  document.cookie = `${SIDEBAR_PREFS_COOKIE}=${encodeURIComponent(
    JSON.stringify(prefs),
  )}; path=/; max-age=31536000; samesite=lax`;
}
