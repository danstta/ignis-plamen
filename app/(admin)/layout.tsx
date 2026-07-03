import { AppSidebar } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/command/command-palette";
import { listFolders } from "@/lib/folders/service";
import { listTemplates } from "@/lib/templates/service";
import { listWorkflows } from "@/lib/workflows/service";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The sidebar lists templates and workflows. Fall back to empty lists when
  // the database isn't reachable so the shell still renders (pages surface the
  // detailed "database not reachable" hint).
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let workflows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let designFolders: Awaited<ReturnType<typeof listFolders>> = [];
  let workflowFolders: Awaited<ReturnType<typeof listFolders>> = [];
  try {
    templates = await listTemplates();
  } catch {}
  try {
    workflows = await listWorkflows();
  } catch {}
  try {
    designFolders = await listFolders("design");
  } catch {}
  try {
    workflowFolders = await listFolders("workflow");
  } catch {}

  return (
    <div className="flex h-svh overflow-hidden">
      <AppSidebar
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          folderId: t.folderId,
        }))}
        workflows={workflows.map((w) => ({
          id: w.id,
          name: w.name,
          folderId: w.folderId,
          active: w.active,
        }))}
        designFolders={designFolders.map((f) => ({
          id: f.id,
          kind: f.kind,
          name: f.name,
        }))}
        workflowFolders={workflowFolders.map((f) => ({
          id: f.id,
          kind: f.kind,
          name: f.name,
        }))}
      />
      <main className="flex-1 overflow-auto p-8">{children}</main>
      <CommandPalette
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        workflows={workflows.map((w) => ({ id: w.id, name: w.name }))}
      />
    </div>
  );
}
