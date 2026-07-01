import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Funnel,
  KeyRound,
  Link2,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { listConnections } from "@/lib/connections/service";
import { getConnectionType, listConnectionTypes } from "@/lib/connections/registry";
import { getConnectionSetupState } from "@/lib/connections/status";
import { connectionErrorMessage } from "@/lib/connections/errors";
import {
  createConnectionAction,
  createEnvOAuthConnectionAction,
} from "./actions";
import { ProviderIcon } from "@/components/connections/provider-icon";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type SearchParams = {
  auth?: string;
  create?: string;
  error?: string;
  q?: string;
};

function createSearchHref(params: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return `/settings/connections${query ? `?${query}` : ""}`;
}

export default async function SettingsConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { auth, create, error, q } = await searchParams;
  const query = (q ?? "").trim();
  const normalizedQuery = query.toLowerCase();
  const isCreating = create === "1" || create === "true";
  const authFilter = auth === "oauth" || auth === "keys" ? auth : undefined;

  let rows: Awaited<ReturnType<typeof listConnections>> = [];
  let dbError: string | null = null;
  try {
    rows = await listConnections();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const types = listConnectionTypes();
  const filteredTypes = types.filter((type) => {
    const matchesAuth = authFilter ? type.auth.type === authFilter : true;
    const matchesQuery = normalizedQuery
      ? `${type.name} ${type.description}`.toLowerCase().includes(normalizedQuery)
      : true;
    return matchesAuth && matchesQuery;
  });
  const filteredRows = rows.filter((row) => {
    const definition = getConnectionType(row.type);
    return normalizedQuery
      ? `${row.name} ${definition?.name ?? row.type}`
          .toLowerCase()
          .includes(normalizedQuery)
      : true;
  });

  return (
    <div className="dark -m-8 min-h-svh bg-[#050505] p-2 font-[var(--font-geist-sans)] text-white">
      {isCreating ? (
        <ProviderPicker
          authFilter={authFilter}
          dbError={dbError}
          error={error}
          filteredTypes={filteredTypes}
          query={query}
        />
      ) : (
        <ConnectionsOverview
          dbError={dbError}
          error={error}
          filteredRows={filteredRows}
          query={query}
          rows={rows}
        />
      )}
    </div>
  );
}

function ConnectionsOverview({
  dbError,
  error,
  filteredRows,
  query,
  rows,
}: {
  dbError: string | null;
  error?: string;
  filteredRows: Awaited<ReturnType<typeof listConnections>>;
  query: string;
  rows: Awaited<ReturnType<typeof listConnections>>;
}) {
  return (
    <div className="flex max-w-[1360px] flex-col gap-3">
      <Toolbar query={query} />

      {error ? <ConnectionError error={error} /> : null}

      {dbError ? (
        <DatabaseError message={dbError} />
      ) : rows.length === 0 ? (
        <section className="flex min-h-[352px] items-center justify-center rounded-lg border border-white/10 bg-[#0a0a0a] px-6 py-10">
          <div className="flex max-w-[390px] flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-lg border border-white/15 bg-[#111] text-zinc-400">
              <Link2 className="size-7" />
            </div>
            <h1 className="mt-7 text-base font-semibold">No connectors yet</h1>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-zinc-400">
              Access third-party APIs from any project with Ignis-managed OAuth
              and token handling.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                className="h-10 border-white/15 bg-[#080808] px-4 text-sm text-white hover:bg-[#141414]"
                render={<Link href="/settings/connections?create=1&scope=team" />}
              >
                Manage Team Connectors
              </Button>
              <Button
                className="h-10 bg-white px-4 text-sm text-black hover:bg-zinc-200"
                render={<Link href="/settings/connections?create=1" />}
              >
                Create Connector
              </Button>
            </div>
            <Link
              href="/settings/connections?create=1"
              className="mt-4 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Learn more
            </Link>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#0a0a0a]">
          {filteredRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-500">
              No connectors match your search.
            </div>
          ) : (
            filteredRows.map((connection) => {
              const state = getConnectionSetupState(
                connection.type,
                (connection.config ?? {}) as Record<string, unknown>,
              );
              const definition = getConnectionType(connection.type);

              return (
                <Link
                  key={connection.id}
                  href={`/settings/connections/${connection.id}`}
                  className="group flex min-h-[72px] items-center justify-between gap-4 border-b border-white/10 px-8 py-4 last:border-b-0 hover:bg-white/[0.035]"
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center">
                      <ProviderIcon type={connection.type} className="size-7" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">
                        {connection.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                        {state.configured ? (
                          <>
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                            Ready for workflows
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-3.5" />
                            Missing {state.missingLabels.join(", ")}
                          </>
                        )}
                        <span className="text-zinc-700">/</span>
                        {definition?.name ?? connection.type}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                </Link>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

function ProviderPicker({
  authFilter,
  dbError,
  error,
  filteredTypes,
  query,
}: {
  authFilter?: "oauth" | "keys";
  dbError: string | null;
  error?: string;
  filteredTypes: ReturnType<typeof listConnectionTypes>;
  query: string;
}) {
  return (
    <div className="max-w-[700px] border-r border-white/10 pb-3 pr-5">
      <div className="mb-10 flex items-center gap-4">
        <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-semibold text-black">
          1
        </span>
        <h1 className="text-xl font-semibold">Select a Provider</h1>
      </div>

      {error ? <ConnectionError error={error} /> : null}
      {dbError ? <DatabaseError message={dbError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <AuthTypeCard
          active={authFilter === "oauth"}
          description="Standard OAuth 2.0 provider"
          href={createSearchHref({ create: "1", auth: "oauth", q: query })}
          icon={<Link2 className="size-8" />}
          title="OAuth"
        />
        <AuthTypeCard
          active={authFilter === "keys"}
          description="Static API Key credential"
          href={createSearchHref({ create: "1", auth: "keys", q: query })}
          icon={<KeyRound className="size-8" />}
          title="API Key"
        />
      </div>

      <form action="/settings/connections" className="mt-5">
        <input type="hidden" name="create" value="1" />
        {authFilter ? <input type="hidden" name="auth" value={authFilter} /> : null}
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-[52px] w-full rounded-lg border border-white/15 bg-[#080808] pl-12 pr-4 text-base font-medium text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-white/35 focus:ring-3 focus:ring-white/10"
            defaultValue={query}
            name="q"
            placeholder="Service name or URL"
          />
        </label>
      </form>

      <section className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-[#080808]">
        {filteredTypes.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Search to find more services.
          </div>
        ) : (
          filteredTypes.map((type) => <ProviderRow key={type.id} type={type} />)
        )}
      </section>

      <p className="mt-3 text-center text-sm text-zinc-500">
        Search to find more services.
      </p>
    </div>
  );
}

function Toolbar({ query }: { query: string }) {
  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_40px_auto_auto]">
      <form action="/settings/connections" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
        <input
          className="h-11 w-full rounded-lg border border-white/10 bg-[#080808] pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-white/30 focus:ring-3 focus:ring-white/10"
          defaultValue={query}
          name="q"
          placeholder="Search connectors..."
        />
      </form>
      <button
        aria-label="Filter connectors"
        className="grid size-11 place-items-center rounded-lg border border-white/10 bg-[#080808] text-zinc-300 transition-colors hover:bg-[#141414] focus-visible:border-white/40 focus-visible:ring-3 focus-visible:ring-white/10"
        type="button"
      >
        <Funnel className="size-5" />
      </button>
      <Button
        variant="outline"
        className="h-11 border-white/10 bg-[#080808] px-4 text-sm text-white hover:bg-[#141414]"
        render={<Link href="/settings/connections?create=1&scope=team" />}
      >
        Manage Team Connectors
      </Button>
      <Button
        className="h-11 bg-white px-4 text-sm text-black hover:bg-zinc-200"
        render={<Link href="/settings/connections?create=1" />}
      >
        Create Connector
      </Button>
    </div>
  );
}

function AuthTypeCard({
  active,
  description,
  href,
  icon,
  title,
}: {
  active: boolean;
  description: string;
  href: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-lg border bg-[#080808] p-5 transition-colors hover:border-white/25 hover:bg-[#101010]",
        active ? "border-white/35" : "border-white/15",
      ].join(" ")}
    >
      <div className="text-zinc-400">{icon}</div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-base text-zinc-400">{description}</p>
    </Link>
  );
}

function ProviderRow({
  type,
}: {
  type: ReturnType<typeof listConnectionTypes>[number];
}) {
  const hasEnvOAuth =
    type.auth.type === "oauth" &&
    type.auth.refreshTokenEnv &&
    Boolean(process.env[type.auth.refreshTokenEnv]?.trim());
  const rowContent = (
    <>
      <span className="flex items-center gap-4">
        <span className="grid size-10 place-items-center">
          <ProviderIcon type={type.id} className="size-8" />
        </span>
        <span className="text-[17px] font-semibold">{type.name}</span>
      </span>
      <ChevronRight className="size-6 text-zinc-500" />
    </>
  );

  if (type.auth.type === "oauth") {
    if (hasEnvOAuth) {
      return (
        <form
          action={createEnvOAuthConnectionAction}
          className="border-b border-white/10 last:border-b-0"
        >
          <input type="hidden" name="type" value={type.id} />
          <input type="hidden" name="name" value={`${type.name} (env)`} />
          <button
            className="flex min-h-[71px] w-full items-center justify-between px-7 py-4 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/10"
            type="submit"
          >
            {rowContent}
          </button>
        </form>
      );
    }

    return (
      <Link
        href={`/api/connections/oauth/${type.id}/start`}
        className="flex min-h-[71px] items-center justify-between border-b border-white/10 px-7 py-4 transition-colors last:border-b-0 hover:bg-white/[0.035]"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <form action={createConnectionAction} className="border-b border-white/10 last:border-b-0">
      <input type="hidden" name="type" value={type.id} />
      <input type="hidden" name="name" value={type.name} />
      <button
        className="flex min-h-[71px] w-full items-center justify-between px-7 py-4 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/10"
        type="submit"
      >
        {rowContent}
      </button>
    </form>
  );
}

function ConnectionError({ error }: { error: string }) {
  return (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      Connection error: {connectionErrorMessage(error)}
    </p>
  );
}

function DatabaseError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm">
      <p className="font-medium">Database not reachable</p>
      <p className="mt-1 text-zinc-400">{message}</p>
    </div>
  );
}
