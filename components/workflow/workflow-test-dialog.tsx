"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getNodeMeta } from "@/lib/nodes/catalog";
import { useWorkflowEditor } from "@/lib/workflows/store";
import type { WorkflowGraph } from "@/lib/workflows/types";
import type { WorkflowTestResult } from "@/lib/workflows/test-runner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DEFAULT_EVENT = {
  body: {
    location: "Belgrade Youth Center",
    caption: "Call for participants",
  },
  headers: {},
  query: {},
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function statusTone(status: string) {
  if (status === "success") return "text-emerald-600 dark:text-emerald-400";
  if (status === "paused") return "text-amber-600 dark:text-amber-400";
  if (status === "skipped") return "text-muted-foreground";
  return "text-destructive";
}

function statusIcon(status: string) {
  if (status === "success") return <CheckCircle2 className="size-3.5" />;
  return <XCircle className="size-3.5" />;
}

export function WorkflowTestDialog({
  open,
  onOpenChange,
  initialTargetNodeId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTargetNodeId?: string | null;
}) {
  const nodes = useWorkflowEditor((s) => s.nodes);
  const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId);
  const [eventText, setEventText] = useState(() => pretty(DEFAULT_EVENT));
  const [running, setRunning] = useState<"workflow" | "node" | null>(null);
  const [result, setResult] = useState<WorkflowTestResult | null>(null);

  const targetNodeId = initialTargetNodeId ?? selectedNodeId;
  const targetNode = nodes.find((n) => n.id === targetNodeId);
  const targetLabel = targetNode
    ? (getNodeMeta(targetNode.type ?? "")?.label ?? targetNode.type)
    : null;

  const capturedSample = useMemo(() => {
    const webhook = nodes.find((n) => n.type === "webhook" && n.data.config.sample);
    return webhook?.data.config.sample;
  }, [nodes]);

  const run = async (mode: "workflow" | "node") => {
    let trigger: Record<string, unknown>;
    try {
      trigger = JSON.parse(eventText) as Record<string, unknown>;
    } catch {
      toast.error("Sample event is not valid JSON");
      return;
    }

    setRunning(mode);
    setResult(null);
    const graph: WorkflowGraph = useWorkflowEditor.getState().toGraph();
    try {
      const res = await fetch("/api/workflows/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph,
          trigger,
          targetNodeId: mode === "node" ? targetNodeId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ? pretty(data.error) : res.statusText);
      setResult(data as WorkflowTestResult);
    } catch (error) {
      toast.error("Test run failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" /> Test workflow
          </DialogTitle>
          <DialogDescription>
            Run the current canvas with a sample event and inspect each step.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="workflow-test-event">Sample event</Label>
              {capturedSample ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEventText(pretty(capturedSample))}
                >
                  Use captured sample
                </Button>
              ) : null}
            </div>
            <Textarea
              id="workflow-test-event"
              value={eventText}
              onChange={(e) => setEventText(e.target.value)}
              spellCheck={false}
              className="min-h-72 resize-none font-mono text-xs"
            />
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <Label>Step results</Label>
            <ScrollArea className="h-72 rounded-lg border">
              <div className="flex flex-col gap-2 p-2">
                {!result ? (
                  <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                    No test run yet.
                  </p>
                ) : (
                  result.nodes.map((node, index) => (
                    <div key={`${node.nodeId}-${index}`} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{node.label}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {node.nodeId.slice(0, 8)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-xs font-medium capitalize",
                            statusTone(node.status),
                          )}
                        >
                          {statusIcon(node.status)}
                          {node.status}
                        </span>
                      </div>
                      {node.error ? (
                        <p className="mt-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                          {node.error}
                        </p>
                      ) : null}
                      {node.note ? (
                        <p className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                          {node.note}
                        </p>
                      ) : null}
                      {node.outputs !== undefined ? (
                        <pre className="mt-2 max-h-36 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                          {pretty(node.outputs)}
                        </pre>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={running !== null || !targetNodeId}
            onClick={() => void run("node")}
          >
            <Play className="size-3.5" />
            {running === "node"
              ? "Testing node..."
              : targetLabel
                ? `Test ${targetLabel}`
                : "Test selected node"}
          </Button>
          <Button
            type="button"
            disabled={running !== null}
            onClick={() => void run("workflow")}
          >
            <Play className="size-3.5" />
            {running === "workflow" ? "Testing..." : "Test workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
