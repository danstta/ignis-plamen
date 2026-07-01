import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Funnel,
  KeyRound,
  Link2,
  Search,
  Server,
} from "lucide-react";
import type { ReactNode } from "react";
import { listConnections } from "@/lib/connections/service";
import { getConnectionType, listConnectionTypes } from "@/lib/connections/registry";
import { getConnectionSetupState } from "@/lib/connections/status";
import { connectionErrorMessage } from "@/lib/connections/errors";
import { listServerEnvironmentConnections } from "@/lib/connections/server-env";
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
  const serverEnvConnections = listServerEnvironmentConnections()
    .filter((connection) => connection.present.length > 0)
    .filter((connection) =>
      normalizedQuery
        ? [
            connection.name,
            connection.description,
            connection.access,
            ...connection.env.map((env) => env.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true,
    );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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
          serverEnvConnections={serverEnvConnections}
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
  serverEnvConnections,
}: {
  dbError: string | null;
  error?: string;
  filteredRows: Awaited<ReturnType<typeof listConnections>>;
  query: string;
  rows: Awaited<ReturnType<typeof listConnections>>;
  serverEnvConnections: ReturnType<typeof listServerEnvironmentConnections>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Toolbar query={query} />

      {error ? <ConnectionError error={error} /> : null}

      {dbError ? (
        <DatabaseError message={dbError} />
      ) : rows.length === 0 ? (
        <section className="flex min-h-[352px] items-center justify-center rounded-lg border bg-card px-6 py-10">
          <div className="flex max-w-[390px] flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-lg border bg-background text-muted-foreground">
              <Link2 className="size-7" />
            </div>
            <h1 className="mt-7 text-base font-semibold">No connectors yet</h1>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted-foreground">
              Access third-party APIs from any project with Ignis-managed OAuth
              and token handling.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                className="h-10 px-4 text-sm"
                render={<Link href="/settings/connections?create=1&scope=team" />}
              >
                Manage Team Connectors
              </Button>
              <Button
                className="h-10 px-4 text-sm"
                render={<Link href="/settings/connections?create=1" />}
              >
                Create Connector
              </Button>
            </div>
            <Link
              href="/settings/connections?create=1"
              className="mt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Learn more
            </Link>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-card">
          {filteredRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
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
                  className="group flex min-h-[72px] items-center justify-between gap-4 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/45 sm:px-8"
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center">
                      <ProviderIcon type={connection.type} className="size-7" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">
                        {connection.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {state.configured ? (
                          <>
                            <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
                            Ready for workflows
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-3.5" />
                            Missing {state.missingLabels.join(", ")}
                          </>
                        )}
                        <span className="text-border">/</span>
                        {definition?.name ?? connection.type}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              );
            })
          )}
        </section>
      )}

      <ServerEnvironmentSection connections={serverEnvConnections} query={query} />
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
    <div className="mx-auto w-full max-w-3xl pb-3">
      <div className="mb-10 flex items-center gap-4">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
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
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-[52px] w-full rounded-lg border bg-background pl-12 pr-4 text-base font-medium outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            defaultValue={query}
            name="q"
            placeholder="Service name or URL"
          />
        </label>
      </form>

      <section className="mt-5 overflow-hidden rounded-lg border bg-card">
        {filteredTypes.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            Search to find more services.
          </div>
        ) : (
          filteredTypes.map((type) => <ProviderRow key={type.id} type={type} />)
        )}
      </section>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        Search to find more services.
      </p>
    </div>
  );
}

function ServerEnvironmentSection({
  connections,
  query,
}: {
  connections: ReturnType<typeof listServerEnvironmentConnections>;
  query: string;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Server className="size-4 text-muted-foreground" />
            Server-side connections
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Environment-backed access available to workflow code on the server.
          </p>
        </div>
        <span className="self-start rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
          {connections.length} detected
        </span>
      </div>

      {connections.length === 0 ? (
        <div className="px-5 py-8 text-sm text-muted-foreground">
          {query
            ? "No server-side environment connections match your search."
            : "No server-side connection environment variables are configured yet."}
        </div>
      ) : (
        <div className="divide-y">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]"
            >
              <div className="flex min-w-0 gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                  {connection.providerType ? (
                    <ProviderIcon type={connection.providerType} className="size-5" />
                  ) : (
                    <Server className="size-5 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{connection.name}</h2>
                    {connection.configured ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-green-600/20 bg-green-500/10 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-300">
                        <CheckCircle2 className="size-3" />
                        Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertCircle className="size-3" />
                        Partial
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {connection.description}
                  </p>
                </div>
              </div>

              <div className="min-w-0 text-sm">
                <p className="leading-6">{connection.access}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connection.env.map((env) => {
                    const isPresent = connection.present.includes(env.name);
                    return (
                      <span
                        key={env.name}
                        className={[
                          "rounded-md border px-2 py-1 font-mono text-[11px]",
                          isPresent
                            ? "bg-background text-muted-foreground"
                            : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        ].join(" ")}
                      >
                        {env.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Toolbar({ query }: { query: string }) {
  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_40px_auto_auto]">
      <form action="/settings/connections" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-lg border bg-background pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          defaultValue={query}
          name="q"
          placeholder="Search connectors..."
        />
      </form>
      <button
        aria-label="Filter connectors"
        className="grid size-11 place-items-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
        type="button"
      >
        <Funnel className="size-5" />
      </button>
      <Button
        variant="outline"
        className="h-11 px-4 text-sm"
        render={<Link href="/settings/connections?create=1&scope=team" />}
      >
        Manage Team Connectors
      </Button>
      <Button
        className="h-11 px-4 text-sm"
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
        "rounded-lg border bg-card p-5 transition-colors hover:bg-muted/45",
        active ? "border-foreground/35" : "",
      ].join(" ")}
    >
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-base text-muted-foreground">{description}</p>
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
      <ChevronRight className="size-6 text-muted-foreground" />
    </>
  );

  if (type.auth.type === "oauth") {
    if (hasEnvOAuth) {
      return (
        <form
          action={createEnvOAuthConnectionAction}
          className="border-b last:border-b-0"
        >
          <input type="hidden" name="type" value={type.id} />
          <input type="hidden" name="name" value={`${type.name} (env)`} />
          <button
            className="flex min-h-[71px] w-full items-center justify-between px-7 py-4 text-left transition-colors hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
        className="flex min-h-[71px] items-center justify-between border-b px-7 py-4 transition-colors last:border-b-0 hover:bg-muted/45"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <form action={createConnectionAction} className="border-b last:border-b-0">
      <input type="hidden" name="type" value={type.id} />
      <input type="hidden" name="name" value={type.name} />
      <button
        className="flex min-h-[71px] w-full items-center justify-between px-7 py-4 text-left transition-colors hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        type="submit"
      >
        {rowContent}
      </button>
    </form>
  );
}

function ConnectionError({ error }: { error: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      Connection error: {connectionErrorMessage(error)}
    </p>
  );
}

function DatabaseError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-5 text-sm">
      <p className="font-medium">Database not reachable</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
    </div>
  );
}
