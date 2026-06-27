import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { getConnection } from "@/lib/connections/service";
import { getConnectionType } from "@/lib/connections/registry";
import { ConnectionConfigForm } from "@/components/connections/connection-config-form";
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button";
import { ProviderIcon } from "@/components/connections/provider-icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
  const connected = isOAuth
    ? Boolean(config.access_token)
    : keyFields.some((f) => Boolean(config[f.name]));
  const expiresAt =
    typeof config.expires_at === "number" ? new Date(config.expires_at) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        render={<Link href="/settings/connections" />}
      >
        <ArrowLeft className="size-4" /> Connections
      </Button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ProviderIcon type={conn.type} className="size-8 shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold">{conn.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{def.name}</p>
          </div>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <AlertCircle className="size-4" /> Not connected
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Connection error: {error}
        </p>
      ) : null}

      <Separator className="my-6" />

      {isOAuth ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Authorization</h2>
          <p className="text-sm text-muted-foreground">
            {connected
              ? "This account is authorized via OAuth."
              : "Authorize this account to start using it."}
            {config.scope ? (
              <>
                {" "}
                Scopes: <code className="text-xs">{String(config.scope)}</code>.
              </>
            ) : null}
            {expiresAt ? (
              <> Access token renews after {expiresAt.toLocaleString()}.</>
            ) : null}
          </p>
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
            {connected ? "Reconnect" : "Connect"} {def.name}
          </Button>
        </section>
      ) : null}

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {isOAuth ? "Name" : "Configuration"}
        </h2>
        <ConnectionConfigForm
          id={id}
          name={conn.name}
          fields={keyFields}
          values={values}
        />
      </section>

      <Separator className="my-6" />

      <DeleteConnectionButton id={id} name={conn.name} />
    </div>
  );
}
