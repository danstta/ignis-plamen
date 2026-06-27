import Link from "next/link";
import { Plug, CheckCircle2, AlertCircle } from "lucide-react";
import { listConnections } from "@/lib/connections/service";
import {
  getConnectionType,
  listConnectionTypes,
} from "@/lib/connections/registry";
import { createConnectionAction } from "./actions";
import { ProviderIcon } from "@/components/connections/provider-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Whether an account row has usable credentials yet. */
function isConfigured(type: string, config: Record<string, unknown>): boolean {
  const def = getConnectionType(type);
  if (!def) return false;
  if (def.auth.type === "oauth") return Boolean(config?.access_token);
  return def.auth.fields.some((f) => Boolean(config?.[f.name]));
}

export default async function SettingsConnectionsPage() {
  let rows: Awaited<ReturnType<typeof listConnections>> = [];
  let dbError: string | null = null;
  try {
    rows = await listConnections();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }
  const types = listConnectionTypes();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Plug className="size-5" />
        <h1 className="text-2xl font-semibold">Connections</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect external accounts. Workflow nodes use these to read and write data
        on your behalf.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium">Add a connection</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {types.map((t) =>
            t.auth.type === "oauth" ? (
              <Button key={t.id} variant="outline" render={<Link href={`/api/connections/oauth/${t.id}/start`} />}>
                <ProviderIcon type={t.id} className="size-4" /> Connect {t.name}
              </Button>
            ) : (
              <form key={t.id} action={createConnectionAction}>
                <input type="hidden" name="type" value={t.id} />
                <input type="hidden" name="name" value={t.name} />
                <Button type="submit" variant="outline">
                  <ProviderIcon type={t.id} className="size-4" /> Add {t.name}
                </Button>
              </form>
            ),
          )}
        </div>
      </section>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>npm run db:migrate</code> to manage connections.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No connections yet. Add one above to get started.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((c) => {
            const configured = isConfigured(
              c.type,
              (c.config ?? {}) as Record<string, unknown>,
            );
            const def = getConnectionType(c.type);
            return (
              <Link key={c.id} href={`/settings/connections/${c.id}`}>
                <Card className="h-full transition-colors hover:border-foreground/20">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <ProviderIcon
                          type={c.type}
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                      {configured ? (
                        <span className="flex items-center gap-1 text-xs font-normal text-green-600">
                          <CheckCircle2 className="size-4" /> Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <AlertCircle className="size-4" /> Incomplete
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>{def?.name ?? c.type}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
