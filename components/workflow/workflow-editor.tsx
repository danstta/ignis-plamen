"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { FlaskConical, ListChecks, Save } from "lucide-react";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { useAutosave } from "@/lib/hooks/use-autosave";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { NodePalette } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { WorkflowTestDialog } from "./workflow-test-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const WorkflowCanvas = dynamic(
  () => import("./workflow-canvas").then((m) => m.WorkflowCanvas),
  { ssr: false },
);

type ConnectionOption = {
  id: string;
  name: string;
  type: string;
  models: { value: string; label: string }[];
};
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
  connections: ConnectionOption[];
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
    const after = useWorkflowEditor.getState();
    if (JSON.stringify(build(after)) === snapshot) after.markSaved();
    if (!auto) toast.success("Workflow saved");
  }, []);

  const { status, saving, saveNow } = useAutosave({
    store: useWorkflowEditor,
    save,
  });
  const saveStatusLabel =
    status === "saved"
      ? "All changes saved"
      : status === "saving"
        ? "Saving changes"
        : "Unsaved changes";
  const saveStatusClassName = cn(
    "border transition-colors disabled:opacity-100",
    status === "saved" &&
      "border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-700 hover:bg-emerald-500/[0.12] dark:text-emerald-300",
    status === "saving" &&
      "border-sky-500/15 bg-sky-500/[0.08] text-sky-700 hover:bg-sky-500/[0.12] dark:text-sky-300",
    status === "unsaved" &&
      "border-amber-500/20 bg-amber-500/[0.09] text-amber-700 hover:bg-amber-500/[0.13] dark:text-amber-300",
  );

  return (
    <div className="-m-8 flex h-svh">
      <aside className="scrollbar-thin-muted w-56 shrink-0 overflow-auto border-r bg-sidebar p-3">
        <NodePalette enabledNodeTypeIds={enabledNodeTypeIds} />
      </aside>

      <div className="relative min-w-0 flex-1">
        <WorkflowCanvas enabledNodeTypeIds={enabledNodeTypeIds} />
      </div>

      <aside className="flex w-[28rem] shrink-0 flex-col overflow-hidden border-l bg-background 2xl:w-[32rem]">
        <div className="shrink-0 border-b bg-background/95 p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label="Workflow name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md font-medium"
            />
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <Switch
                size="sm"
                checked={active}
                onCheckedChange={(v) => setActive(v)}
              />
              <span>{active ? "Active" : "Inactive"}</span>
            </label>
            <Button
              variant="outline"
              size="icon-sm"
              title="Test workflow"
              onClick={() => {
                setTestTargetNodeId(null);
                setTestOpen(true);
              }}
            >
              <FlaskConical className="size-4" />
            </Button>
            {workflowId ? (
              <Button
                variant="outline"
                size="icon-sm"
                title="Runs"
                render={<Link href={`/workflows/${workflowId}/runs`} />}
              >
                <ListChecks className="size-4" />
              </Button>
            ) : null}
            <Button
              onClick={saveNow}
              disabled={saving}
              variant="outline"
              size="icon-sm"
              title={saveStatusLabel}
              aria-label={saveStatusLabel}
              aria-busy={saving}
              className={saveStatusClassName}
            >
              <Save className="size-4" />
              <span className="sr-only">{saveStatusLabel}</span>
            </Button>
          </div>
        </div>

        <div className="scrollbar-thin-muted min-h-0 flex-1 overflow-auto">
          <NodeConfigPanel
            connections={connections}
            templates={templates}
            webhookBaseUrl={webhookBaseUrl}
            enabledNodeTypeIds={enabledNodeTypeIds}
          />
        </div>
      </aside>

      <WorkflowTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        initialTargetNodeId={testTargetNodeId}
      />
    </div>
  );
}
