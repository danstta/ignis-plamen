import Link from "next/link";
import { Plus } from "lucide-react";
import { listAssets } from "@/lib/assets/service";
import { listFolders } from "@/lib/folders/service";
import { listTemplates } from "@/lib/templates/service";
import { FolderedTemplateGrid } from "@/components/templates/foldered-template-grid";
import { Button } from "@/components/ui/button";
import type { TemplateDoc } from "@/lib/editor/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let rows: Awaited<ReturnType<typeof listTemplates>> = [];
  let folders: Awaited<ReturnType<typeof listFolders>> = [];
  let assets: Awaited<ReturnType<typeof listAssets>> = [];
  let dbError: string | null = null;
  try {
    [rows, folders, assets] = await Promise.all([
      listTemplates(),
      listFolders("design"),
      listAssets(),
    ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Designs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design templates with text and image placeholders.
          </p>
        </div>
        <Button render={<Link href="/editor/new" />}>
          <Plus className="size-4" /> New design
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
      ) : (
        <FolderedTemplateGrid
          folders={folders.map((f) => ({
            id: f.id,
            kind: f.kind,
            name: f.name,
            iconUrl: f.iconUrl,
          }))}
          assets={assets}
          templates={rows.map((t) => ({
            id: t.id,
            name: t.name,
            folderId: t.folderId,
            size: `${t.width}x${t.height}`,
            updated: new Date(t.updatedAt).toLocaleDateString(),
            doc: t.doc as TemplateDoc,
          }))}
        />
      )}
    </div>
  );
}
