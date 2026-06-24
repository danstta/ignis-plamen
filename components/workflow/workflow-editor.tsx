"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { useWorkflowEditor } from "@/lib/workflows/store";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { NodePalette } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// The canvas pulls in @xyflow/react (touches window) — load it client-only.
const WorkflowCanvas = dynamic(
  () => import("./workflow-canvas").then((m) => m.WorkflowCanvas),
  { ssr: false },
);

type Option = { id: string; name: string };

export type WorkflowEditorInput = {
  id: string | null;
  name: string;
  active: boolean;
  triggerConnectionId: string | null;
  graph: WorkflowGraph;
};

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WorkflowEditor({
  workflow,
  connections,
  templates,
  enabledNodeTypeIds,
}: {
  workflow: WorkflowEditorInput;
  connections: Option[];
  templates: Option[];
  enabledNodeTypeIds: string[];
}) {
  const load = useWorkflowEditor((s) => s.load);
  const name = useWorkflowEditor((s) => s.name);
  const active = useWorkflowEditor((s) => s.active);
  const triggerConnectionId = useWorkflowEditor((s) => s.triggerConnectionId);
  const workflowId = useWorkflowEditor((s) => s.workflowId);
  const setName = useWorkflowEditor((s) => s.setName);
  const setActive = useWorkflowEditor((s) => s.setActive);
  const setTriggerConnectionId = useWorkflowEditor(
    (s) => s.setTriggerConnectionId,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load(workflow);
  }, [workflow, load]);

  const save = useCallback(async () => {
    const st = useWorkflowEditor.getState();
    setSaving(true);
    try {
      const payload = {
        name: st.name,
        active: st.active,
        triggerConnectionId: st.triggerConnectionId,
        graph: st.toGraph(),
      };
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
        useWorkflowEditor.getState().markSaved(data.id);
        window.history.replaceState(null, "", `/workflows/${data.id}`);
      } else {
        useWorkflowEditor.getState().markSaved();
      }
      toast.success("Workflow saved");
    } catch (err) {
      toast.error("Failed to save", { description: String(err) });
    } finally {
      setSaving(false);
    }
  }, []);

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
          <Label htmlFor="trigger" className="text-xs text-muted-foreground">
            Trigger
          </Label>
          <select
            id="trigger"
            className={selectClass}
            value={triggerConnectionId ?? ""}
            onChange={(e) => setTriggerConnectionId(e.target.value || null)}
          >
            <option value="">— no connection —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={(v) => setActive(v)} />
          <span className="text-sm">{active ? "Active" : "Inactive"}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {workflowId ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/workflows/${workflowId}/runs`} />}
            >
              <ListChecks className="size-4" /> Runs
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving} size="sm">
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
        <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
          <NodeConfigPanel connections={connections} templates={templates} />
        </aside>
      </div>
    </div>
  );
}
