import { AppSidebar } from "@/components/layout/app-sidebar";
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
  try {
    templates = await listTemplates();
  } catch {}
  try {
    workflows = await listWorkflows();
  } catch {}

  return (
    <div className="flex h-svh overflow-hidden">
      <AppSidebar
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        workflows={workflows.map((w) => ({
          id: w.id,
          name: w.name,
          active: w.active,
        }))}
      />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
