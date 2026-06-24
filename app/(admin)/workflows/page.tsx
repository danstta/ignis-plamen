import Link from "next/link";
import { Workflow as WorkflowIcon, Plus, CircleDot } from "lucide-react";
import { listWorkflows } from "@/lib/workflows/service";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  let rows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let dbError: string | null = null;
  try {
    rows = await listWorkflows();
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
            <code>npm run db:migrate</code>.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No workflows yet. Create one to get started.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((w) => (
            <Link key={w.id} href={`/workflows/${w.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/20">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{w.name}</span>
                    <span
                      className={
                        w.active
                          ? "flex items-center gap-1 text-xs font-normal text-green-600"
                          : "flex items-center gap-1 text-xs font-normal text-muted-foreground"
                      }
                    >
                      <CircleDot className="size-3.5" />
                      {w.active ? "Active" : "Inactive"}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    Updated {new Date(w.updatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
