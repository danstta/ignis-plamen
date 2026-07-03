import Link from "next/link";
import { Workflow as WorkflowIcon, Plus } from "lucide-react";
import { listAssets } from "@/lib/assets/service";
import { listFolders } from "@/lib/folders/service";
import { listWorkflows } from "@/lib/workflows/service";
import { FolderedWorkflowGrid } from "@/components/workflow/foldered-workflow-grid";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  let rows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let folders: Awaited<ReturnType<typeof listFolders>> = [];
  let assets: Awaited<ReturnType<typeof listAssets>> = [];
  let dbError: string | null = null;
  try {
    [rows, folders, assets] = await Promise.all([
      listWorkflows(),
      listFolders("workflow"),
      listAssets(),
    ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-5" />
            <h1 className="text-2xl font-semibold">Workflows</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual automations that run when a connection&apos;s webhook fires.
          </p>
        </div>
        <Button render={<Link href="/workflows/new" />}>
          <Plus className="size-4" /> New workflow
        </Button>
      </div>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : (
        <FolderedWorkflowGrid
          folders={folders.map((f) => ({
            id: f.id,
            kind: f.kind,
            name: f.name,
            iconUrl: f.iconUrl,
          }))}
          assets={assets}
          workflows={rows.map((w) => ({
            id: w.id,
            name: w.name,
            folderId: w.folderId,
            active: w.active,
            updated: new Date(w.updatedAt).toLocaleString(),
          }))}
        />
      )}
    </div>
  );
}
