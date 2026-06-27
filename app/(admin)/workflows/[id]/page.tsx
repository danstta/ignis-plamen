import { notFound } from "next/navigation";
import { WorkflowEditor } from "@/components/workflow/workflow-editor";
import { getWorkflow } from "@/lib/workflows/service";
import { listConnections } from "@/lib/connections/service";
import { listTemplatesWithPlaceholders } from "@/lib/templates/service";
import { enabledNodeTypeIds } from "@/lib/plugins/service";
import { publicAppUrl } from "@/lib/env";
import { emptyGraph, type WorkflowGraph } from "@/lib/workflows/types";

export const dynamic = "force-dynamic";

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [connections, templates, enabledIds] = await Promise.all([
    listConnections().catch(() => []),
    listTemplatesWithPlaceholders().catch(() => []),
    enabledNodeTypeIds().catch(() => new Set<string>()),
  ]);

  const connectionOpts = connections.map((c) => ({ id: c.id, name: c.name }));
  const templateOpts = templates.map((t) => ({
    id: t.id,
    name: t.name,
    placeholders: t.placeholders,
  }));
  const enabled = Array.from(enabledIds);
  const webhookBaseUrl = publicAppUrl() ?? "";

  if (id === "new") {
    return (
      <WorkflowEditor
        workflow={{
          id: null,
          name: "Untitled workflow",
          active: false,
          graph: emptyGraph(),
        }}
        connections={connectionOpts}
        templates={templateOpts}
        enabledNodeTypeIds={enabled}
        webhookBaseUrl={webhookBaseUrl}
      />
    );
  }

  const row = await getWorkflow(id);
  if (!row) notFound();

  return (
    <WorkflowEditor
      workflow={{
        id: row.id,
        name: row.name,
        active: row.active,
        graph: row.graph as WorkflowGraph,
      }}
      connections={connectionOpts}
      templates={templateOpts}
      enabledNodeTypeIds={enabled}
      webhookBaseUrl={webhookBaseUrl}
    />
  );
}
