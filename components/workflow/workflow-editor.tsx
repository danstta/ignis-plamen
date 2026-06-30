"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { FlaskConical, ListChecks } from "lucide-react";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { useAutosave } from "@/lib/hooks/use-autosave";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { NodePalette } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { WorkflowTestDialog } from "./workflow-test-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SaveStatusDot } from "@/components/ui/save-status-dot";

// The canvas pulls in @xyflow/react (touches window) — load it client-only.
const WorkflowCanvas = dynamic(
  () => import("./workflow-canvas").then((m) => m.WorkflowCanvas),
  { ssr: false },
);

type Option = { id: string; name: string };
type TemplateOption = {
  id: string;
  name: string;
  placeholders: { key: string; kind: "text" | "image" }[];
};

export type WorkflowEditorInput = {
  id: string | null;
  name: string;
  active: boolean;
  graph: WorkflowGraph;
};

export function WorkflowEditor({
  workflow,
  connections,
  templates,
  enabledNodeTypeIds,
  webhookBaseUrl,
}: {
  workflow: WorkflowEditorInput;
  connections: Option[];
  templates: TemplateOption[];
  enabledNodeTypeIds: string[];
  webhookBaseUrl: string;
}) {
  const load = useWorkflowEditor((s) => s.load);
  const name = useWorkflowEditor((s) => s.name);
  const active = useWorkflowEditor((s) => s.active);
  const workflowId = useWorkflowEditor((s) => s.workflowId);
  const setName = useWorkflowEditor((s) => s.setName);
  const setActive = useWorkflowEditor((s) => s.setActive);
  const [testOpen, setTestOpen] = useState(false);
  const [testTargetNodeId, setTestTargetNodeId] = useState<string | null>(null);

  useEffect(() => {
    load(workflow);
  }, [workflow, load]);

  const save = useCallback(async ({ auto }: { auto: boolean }) => {
    const build = (s: ReturnType<typeof useWorkflowEditor.getState>) => ({
      name: s.name,
      active: s.active,
      graph: s.toGraph(),
    });
    const st = useWorkflowEditor.getState();
    const payload = build(st);
    const snapshot = JSON.stringify(payload);
    const res = st.workflowId
      ? await fetch(`/api/workflows/${st.workflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/workflows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!st.workflowId && data?.id) {
      useWorkflowEditor.setState({ workflowId: data.id });
      window.history.replaceState(null, "", `/workflows/${data.id}`);
    }
    // Only mark clean if nothing changed while the request was in flight,
    // so edits made mid-save aren't dropped (a follow-up autosave catches them).
    const after = useWorkflowEditor.getState();
    if (JSON.stringify(build(after)) === snapshot) after.markSaved();
    if (!auto) toast.success("Workflow saved");
  }, []);

  const { status, saving, saveNow } = useAutosave({
    store: useWorkflowEditor,
    save,
  });

  return (
    // Fit within the admin layout's p-8 (4rem vertical) padding without scroll.
    <div className="-m-8 flex h-svh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 max-w-xs font-medium"
        />
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={(v) => setActive(v)} />
          <span className="text-sm">{active ? "Active" : "Inactive"}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTestTargetNodeId(null);
              setTestOpen(true);
            }}
          >
            <FlaskConical className="size-4" /> Test workflow
          </Button>
          {workflowId ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/workflows/${workflowId}/runs`} />}
            >
              <ListChecks className="size-4" /> Runs
            </Button>
          ) : null}
          <SaveStatusDot status={status} />
          <Button onClick={saveNow} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r bg-sidebar p-3">
          <NodePalette enabledNodeTypeIds={enabledNodeTypeIds} />
        </aside>
        <div className="relative min-w-0 flex-1">
          <WorkflowCanvas />
        </div>
        <aside className="w-[28rem] shrink-0 overflow-auto border-l bg-background 2xl:w-[32rem]">
          <NodeConfigPanel
            connections={connections}
            templates={templates}
            webhookBaseUrl={webhookBaseUrl}
            enabledNodeTypeIds={enabledNodeTypeIds}
          />
        </aside>
      </div>
      <WorkflowTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        initialTargetNodeId={testTargetNodeId}
      />
    </div>
  );
}
