import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  linkHubSupabaseServiceRoleKey,
  linkHubSupabaseUrl,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/env";
import {
  mapLinkHubPayloadToProject,
  mapNotionPageToLinkHubProject,
  pageBelongsToConfiguredDataSource,
  queryLinkHubNotionPages,
  retrieveNotionPage,
  type LinkHubPropertyNames,
  type LinkHubPropertyValues,
  type LinkHubProjectUpsert,
} from "./notion";

const TABLE = "link_hub_projects";
const STALE_HIDE_BATCH_SIZE = 100;

let cachedClient: SupabaseClient | null = null;

function supabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = linkHubSupabaseUrl() ?? supabaseUrl();
  const key = linkHubSupabaseServiceRoleKey() ?? supabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "Supabase Link Hub sync is not configured. Set LINK_HUB_SUPABASE_URL and LINK_HUB_SUPABASE_SERVICE_ROLE_KEY for the NGO website database.",
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertLinkHubProjects(
  rows: LinkHubProjectUpsert[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "notion_page_id" });
  if (error) throw new Error(`Supabase Link Hub upsert failed: ${error.message}`);
}

async function hideProject(pageId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from(TABLE)
    .update(
      { show_on_links: false, updated_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("notion_page_id", pageId);
  if (error) throw new Error(`Supabase Link Hub hide failed: ${error.message}`);
  return count ?? 0;
}

async function hideMissingProjects(currentPageIds: Set<string>): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select("notion_page_id")
    .eq("show_on_links", true);
  if (error) {
    throw new Error(`Supabase Link Hub stale lookup failed: ${error.message}`);
  }

  const staleIds = (data ?? [])
    .map((row) =>
      typeof row.notion_page_id === "string" ? row.notion_page_id : null,
    )
    .filter((id): id is string => Boolean(id && !currentPageIds.has(id)));

  if (staleIds.length === 0) return 0;

  const now = new Date().toISOString();
  for (const ids of chunk(staleIds, STALE_HIDE_BATCH_SIZE)) {
    const { error: updateError } = await supabaseAdmin()
      .from(TABLE)
      .update({ show_on_links: false, updated_at: now })
      .in("notion_page_id", ids);
    if (updateError) {
      throw new Error(
        `Supabase Link Hub stale hide failed: ${updateError.message}`,
      );
    }
  }

  return staleIds.length;
}

export type LinkHubSyncResult = {
  mode: "payload" | "page" | "full";
  upserted: number;
  hidden: number;
  project?: LinkHubProjectUpsert;
  skipped?: string;
};

export async function syncLinkHubPayload(
  payload: unknown,
  names?: LinkHubPropertyNames,
  values?: LinkHubPropertyValues,
): Promise<LinkHubSyncResult> {
  const project = mapLinkHubPayloadToProject(payload, new Date(), names, values);
  if (!project) {
    return {
      mode: "payload",
      upserted: 0,
      hidden: 0,
      skipped: "payload_missing_link_hub_fields",
    };
  }

  await upsertLinkHubProjects([project]);
  return {
    mode: "payload",
    upserted: 1,
    hidden: 0,
    project,
  };
}

export async function syncLinkHubPage(
  pageId: string,
  names?: LinkHubPropertyNames,
): Promise<LinkHubSyncResult> {
  const page = await retrieveNotionPage(pageId);
  if (!page) {
    return {
      mode: "page",
      upserted: 0,
      hidden: await hideProject(pageId),
      skipped: "notion_page_not_found",
    };
  }

  if (!pageBelongsToConfiguredDataSource(page)) {
    return {
      mode: "page",
      upserted: 0,
      hidden: 0,
      skipped: "page_outside_configured_data_source",
    };
  }

  await upsertLinkHubProjects([
    mapNotionPageToLinkHubProject(page, new Date(), names),
  ]);
  return { mode: "page", upserted: 1, hidden: 0 };
}

export async function syncLinkHubDataSource(
  names?: LinkHubPropertyNames,
): Promise<LinkHubSyncResult> {
  const pages = await queryLinkHubNotionPages();
  const now = new Date();
  const rows = pages
    .filter(pageBelongsToConfiguredDataSource)
    .map((page) => mapNotionPageToLinkHubProject(page, now, names));

  await upsertLinkHubProjects(rows);
  const hidden = await hideMissingProjects(
    new Set(rows.map((row) => row.notion_page_id)),
  );

  return { mode: "full", upserted: rows.length, hidden };
}
