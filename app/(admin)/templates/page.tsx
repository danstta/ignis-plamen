import Link from "next/link";
import { Plus } from "lucide-react";
import { listTemplates } from "@/lib/templates/service";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import type { TemplateDoc } from "@/lib/editor/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let rows: Awaited<ReturnType<typeof listTemplates>> = [];
  let dbError: string | null = null;
  try {
    rows = await listTemplates();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design templates with text and image placeholders.
          </p>
        </div>
        <Button render={<Link href="/editor/new" />}>
          <Plus className="size-4" /> New template
        </Button>
      </div>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>. You can still design at{" "}
            <Link href="/editor/new" className="underline">
              /editor/new
            </Link>{" "}
            (saving needs the database).
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No templates yet.</p>
          <Button className="mt-3" render={<Link href="/editor/new" />}>
            <Plus className="size-4" /> Create your first template
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <TemplateCard
              key={t.id}
              id={t.id}
              name={t.name}
              size={`${t.width}×${t.height}`}
              updated={new Date(t.updatedAt).toLocaleDateString()}
              doc={t.doc as TemplateDoc}
            />
          ))}
        </div>
      )}
    </div>
  );
}
