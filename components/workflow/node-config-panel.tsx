"use client";

import { Trash2 } from "lucide-react";
import { getNodeMeta } from "@/lib/nodes/catalog";
import type { NodeConfigField } from "@/lib/nodes/types";
import { useWorkflowEditor } from "@/lib/workflows/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Option = { id: string; name: string };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function NodeConfigPanel({
  connections,
  templates,
}: {
  connections: Option[];
  templates: Option[];
}) {
  const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId);
  const node = useWorkflowEditor((s) =>
    s.nodes.find((n) => n.id === s.selectedNodeId),
  );
  const updateNodeConfig = useWorkflowEditor((s) => s.updateNodeConfig);
  const removeNode = useWorkflowEditor((s) => s.removeNode);

  if (!node || !selectedNodeId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Select a node to configure it.
      </p>
    );
  }

  const def = getNodeMeta(node.type ?? "");
  if (!def) {
    return <p className="p-4 text-sm text-destructive">Unknown node type.</p>;
  }

  const config = node.data?.config ?? {};
  const set = (name: string, value: unknown) =>
    updateNodeConfig(selectedNodeId, { ...config, [name]: value });

  const renderField = (f: NodeConfigField) => {
    const value = config[f.name];
    const str = value === undefined || value === null ? "" : String(value);

    switch (f.type) {
      case "textarea":
        return (
          <Textarea
            id={f.name}
            value={str}
            onChange={(e) => set(f.name, e.target.value)}
            rows={4}
          />
        );
      case "number":
        return (
          <Input
            id={f.name}
            type="number"
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );
      case "select":
        return (
          <select
            id={f.name}
            className={selectClass}
            value={str}
            onChange={(e) => set(f.name, e.target.value)}
          >
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "connection":
      case "template": {
        const options = f.type === "connection" ? connections : templates;
        return (
          <select
            id={f.name}
            className={selectClass}
            value={str}
            onChange={(e) => set(f.name, e.target.value)}
          >
            <option value="">— select —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        );
      }
      default:
        return (
          <Input
            id={f.name}
            type={f.type === "password" ? "password" : "text"}
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => set(f.name, e.target.value)}
            autoComplete="off"
          />
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-sm font-semibold">{def.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
      </div>

      {def.configFields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          {renderField(f)}
          {f.help ? (
            <p className="text-xs text-muted-foreground">{f.help}</p>
          ) : null}
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-destructive hover:text-destructive"
        onClick={() => removeNode(selectedNodeId)}
      >
        <Trash2 className="size-4" /> Delete node
      </Button>
    </div>
  );
}
