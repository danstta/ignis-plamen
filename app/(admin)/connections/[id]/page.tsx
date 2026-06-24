import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { publicAppUrl } from "@/lib/env";
import { getConnection } from "@/lib/connections/service";
import { getConnectionType } from "@/lib/connections/registry";
import type { FieldDescriptor } from "@/lib/connections/types";
import { listTemplatesWithPlaceholders } from "@/lib/templates/service";
import { listBindingsForConnection } from "@/lib/bindings/service";
import { listRecentJobs } from "@/lib/jobs/service";
import { ConnectionConfigForm } from "@/components/connections/connection-config-form";
import { CopyField } from "@/components/connections/copy-field";
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button";
import {
  BindingsManager,
  type BindingData,
  type TemplateOption,
} from "@/components/connections/bindings-manager";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function ConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const config = def.configSchema.parse(conn.config ?? {}) as Record<
    string,
    string
  >;
  const verificationToken = (conn.config as Record<string, unknown>)
    ?.verificationToken as string | undefined;
  const verified = Boolean(verificationToken);

  // Prefer an explicitly configured public base URL (reachable by Notion). Fall
  // back to the request host, which only works for your own browser, not external
  // services — see PUBLIC_APP_URL in .env.example.
  let base = publicAppUrl();
  if (!base) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "http";
    base = `${proto}://${host}`;
  }
  const webhookUrl = `${base}/api/webhooks/${id}`;

  let fields: FieldDescriptor[] = [];
  let fieldsError: string | null = null;
  try {
    fields = await def.listFields(config);
  } catch (err) {
    fieldsError = err instanceof Error ? err.message : String(err);
  }

  const templates: TemplateOption[] = await listTemplatesWithPlaceholders().catch(
    () => [],
  );
  const bindingRows = await listBindingsForConnection(id).catch(() => []);
  const bindings: BindingData[] = bindingRows.map((b) => ({
    id: b.id,
    templateId: b.templateId,
    fieldMap: b.fieldMap ?? {},
    defaults: b.defaults ?? {},
    active: b.active,
  }));
  const jobs = await listRecentJobs(id).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        render={<Link href="/connections" />}
      >
        <ArrowLeft className="size-4" /> Connections
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{conn.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{def.name}</p>
        </div>
        {verified ? (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" /> Verified
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <AlertCircle className="size-4" /> Not verified
          </span>
        )}
      </div>

      <Separator className="my-6" />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Webhook URL</h2>
        <p className="text-sm text-muted-foreground">
          Add this URL as a webhook subscription in Notion. Notion must be able to
          reach it over public HTTPS — in local dev, run a tunnel and set
          PUBLIC_APP_URL (see .env.example). Notion then sends a one-time
          verification request, captured below.
        </p>
        <CopyField value={webhookUrl} />

        {verificationToken ? (
          <div className="mt-2 flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Verification token</h3>
            <p className="text-sm text-muted-foreground">
              Notion’s handshake was received. Copy this token, paste it into the
              Webhooks tab in your Notion integration, and click “Verify
              subscription” to activate it.
            </p>
            <CopyField value={verificationToken} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Waiting for Notion’s verification request… create the subscription in
            Notion, then reload this page to reveal the token to paste back.
          </p>
        )}
      </section>

      <Separator className="my-6" />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Configuration</h2>
        <ConnectionConfigForm
          id={id}
          name={conn.name}
          fields={def.configFields}
          values={config}
        />
      </section>

      <Separator className="my-6" />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Available fields</h2>
        {fieldsError ? (
          <p className="text-sm text-destructive">{fieldsError}</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a valid token and database ID, then save, to list bindable fields.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <li
                key={f.key}
                className="rounded-md border px-2 py-1 text-xs"
                title={f.kind}
              >
                {f.label}
                <span className="ml-1 text-muted-foreground">· {f.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator className="my-6" />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Bindings</h2>
          <p className="text-sm text-muted-foreground">
            Map this connection’s fields onto a template’s placeholders. Active
            bindings render automatically when an event arrives.
          </p>
        </div>
        <BindingsManager
          connectionId={id}
          fields={fields}
          templates={templates}
          bindings={bindings}
        />
      </section>

      <Separator className="my-6" />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Recent renders</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No renders yet. They appear here when a webhook event is processed.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-col gap-1 text-xs">
                {j.status === "success" && j.outputUrl ? (
                  <a href={j.outputUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={j.outputUrl}
                      alt=""
                      className="aspect-square w-full rounded-md border object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed text-destructive">
                    error
                  </div>
                )}
                <span className="truncate text-muted-foreground">
                  {j.templateName ?? "—"} ·{" "}
                  {new Date(j.createdAt).toLocaleString()}
                </span>
                {j.error ? (
                  <span className="truncate text-destructive" title={j.error}>
                    {j.error}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      <DeleteConnectionButton id={id} name={conn.name} />
    </div>
  );
}
