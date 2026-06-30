import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { listConnections } from "@/lib/connections/service";
import { getConnectionType, listConnectionTypes } from "@/lib/connections/registry";
import { getConnectionSetupState } from "@/lib/connections/status";
import { connectionErrorMessage } from "@/lib/connections/errors";
import { createConnectionAction } from "./actions";
import { ProviderIcon } from "@/components/connections/provider-icon";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  let rows: Awaited<ReturnType<typeof listConnections>> = [];
  let dbError: string | null = null;
  try {
    rows = await listConnections();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }
  const types = listConnectionTypes();
  const connectedCount = rows.filter((row) =>
    getConnectionSetupState(row.type, (row.config ?? {}) as Record<string, unknown>)
      .configured,
  ).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="grid gap-4 rounded-xl border bg-muted/25 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Plug className="size-4" />
            Settings
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Connections
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect storage, workspace apps, and model providers once. Workflow
            nodes can reuse these accounts without pasting credentials into
            every automation.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm md:min-w-64">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-2xl font-semibold tabular-nums">{rows.length}</p>
            <p className="text-muted-foreground">saved</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-2xl font-semibold tabular-nums">
              {connectedCount}
            </p>
            <p className="text-muted-foreground">ready</p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Connection error: {connectionErrorMessage(error)}
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Add a connection</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick the provider, then finish authorization or paste the required
              credentials.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Stored server-side
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {types.map((type) => {
            const isOAuth = type.auth.type === "oauth";
            const count = rows.filter((row) => row.type === type.id).length;
            const action = isOAuth ? (
              <Button
                size="sm"
                render={<Link href={`/api/connections/oauth/${type.id}/start`} />}
              >
                <Link2 className="size-4" />
                Connect
              </Button>
            ) : (
              <form action={createConnectionAction}>
                <input type="hidden" name="type" value={type.id} />
                <input type="hidden" name="name" value={type.name} />
                <Button type="submit" size="sm">
                  <KeyRound className="size-4" />
                  Add key
                </Button>
              </form>
            );

            return (
              <article
                key={type.id}
                className="flex min-h-44 flex-col justify-between rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border bg-background">
                      <ProviderIcon type={type.id} className="size-5" />
                    </div>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {isOAuth ? "OAuth" : "API key"}
                    </span>
                  </div>
                  <h3 className="mt-3 font-medium">{type.name}</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {type.description}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {count === 0
                      ? "No accounts"
                      : `${count} account${count === 1 ? "" : "s"}`}
                  </span>
                  {action}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {dbError ? (
        <div className="rounded-xl border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code> to manage connections.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg border bg-background">
            <Plug className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No saved connections yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Start with Google Drive for assets, then add model keys when your
            workflows need generation or classification.
          </p>
        </div>
      ) : (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Saved connections</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a connection to rename it, reconnect OAuth, rotate keys, or
                remove it.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((c) => {
              const state = getConnectionSetupState(
                c.type,
                (c.config ?? {}) as Record<string, unknown>,
              );
              const def = getConnectionType(c.type);
              return (
                <Link key={c.id} href={`/settings/connections/${c.id}`}>
                  <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/20">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                            <ProviderIcon type={c.type} className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{c.name}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {def?.name ?? c.type}
                            </span>
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1.5 pt-2">
                        {state.configured ? (
                          <>
                            <CheckCircle2 className="size-4 text-green-600" />
                            Ready for workflows
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-4" />
                            Missing {state.missingLabels.join(", ")}
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
