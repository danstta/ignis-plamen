import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { getConnection } from "@/lib/connections/service";
import { getConnectionType } from "@/lib/connections/registry";
import { connectionErrorMessage } from "@/lib/connections/errors";
import { getConnectionSetupState } from "@/lib/connections/status";
import { ConnectionConfigForm } from "@/components/connections/connection-config-form";
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button";
import { ProviderIcon } from "@/components/connections/provider-icon";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ConnectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  let conn;
  try {
    conn = await getConnection(id);
  } catch (err) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-6 text-sm">
        <p className="font-medium">Database not reachable</p>
        <p className="mt-1 text-muted-foreground">
          {err instanceof Error ? err.message : String(err)}
        </p>
      </div>
    );
  }
  if (!conn) notFound();

  const def = getConnectionType(conn.type);
  if (!def) notFound();

  const config = (conn.config ?? {}) as Record<string, unknown>;
  const keyFields = def.auth.type === "keys" ? def.auth.fields : [];
  const values: Record<string, string> = {};
  for (const f of keyFields) values[f.name] = String(config[f.name] ?? "");

  const isOAuth = def.auth.type === "oauth";
  const setupState = getConnectionSetupState(conn.type, config);
  const envRefreshTokenName =
    def.auth.type === "oauth" ? def.auth.refreshTokenEnv : undefined;
  const usesEnvRefreshToken =
    Boolean(envRefreshTokenName && process.env[envRefreshTokenName]?.trim()) &&
    config.credential_source === "env";
  const expiresAt =
    typeof config.expires_at === "number" ? new Date(config.expires_at) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        render={<Link href="/settings/connections" />}
      >
        <ArrowLeft className="size-4" /> Connections
      </Button>

      <header className="rounded-xl border bg-muted/25 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
              <ProviderIcon type={conn.type} className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{def.name}</p>
              <h1 className="truncate text-3xl font-semibold tracking-tight">
                {conn.name}
              </h1>
            </div>
          </div>
          {setupState.configured ? (
            <span className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-background px-2.5 py-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" /> Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 self-start rounded-lg border bg-background px-2.5 py-1.5 text-sm text-muted-foreground">
              <AlertCircle className="size-4" /> Needs setup
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">Auth method</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              {isOAuth ? (
                <>
                  <Link2 className="size-4" /> OAuth
                </>
              ) : (
                <>
                  <KeyRound className="size-4" /> API key
                </>
              )}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3 md:col-span-2">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium">
              {setupState.configured
                ? "This connection can be used by workflows."
                : `Missing ${setupState.missingLabels.join(", ")}.`}
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Connection error: {connectionErrorMessage(error)}
        </p>
      ) : null}

      {isOAuth ? (
        <section className="rounded-xl border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Authorization</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {setupState.configured
                  ? usesEnvRefreshToken
                    ? `This account uses ${envRefreshTokenName} from the server environment.`
                    : "This account is authorized via OAuth. Reconnect if scopes change or the token is revoked."
                  : "Authorize this account to start using it in workflows."}
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start"
              render={
                <Link
                  href={`/api/connections/oauth/${def.id}/start?connectionId=${conn.id}`}
                />
              }
            >
              <Link2 className="size-4" />
              {setupState.configured ? "Reconnect" : "Connect"} {def.name}
            </Button>
          </div>
          {config.scope || expiresAt ? (
            <div className="mt-4 grid gap-3 rounded-lg bg-muted/35 p-3 text-sm md:grid-cols-2">
              {config.scope ? (
                <div>
                  <p className="text-xs text-muted-foreground">Scopes</p>
                  <p className="mt-1 break-words font-mono text-xs">
                    {String(config.scope)}
                  </p>
                </div>
              ) : null}
              {expiresAt ? (
                <div>
                  <p className="text-xs text-muted-foreground">Token expiry</p>
                  <p className="mt-1">{expiresAt.toLocaleString()}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">
            {isOAuth ? "Display name" : "Configuration"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {isOAuth
              ? "Rename the saved account so it is easy to recognize inside workflow nodes."
              : "Paste credentials once here. Nodes reference this connection by name instead of storing secrets in the workflow graph."}
          </p>
        </div>
        <ConnectionConfigForm id={id} name={conn.name} fields={keyFields} values={values} />
      </section>

      <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="size-4" />
              Remove connection
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Deleting this connection removes stored credentials and may break
              workflows that reference it.
            </p>
          </div>
          <DeleteConnectionButton id={id} name={conn.name} />
        </div>
      </section>
    </div>
  );
}
