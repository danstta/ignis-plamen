"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Braces, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { toast } from "sonner";
import { getNodeMeta } from "@/lib/nodes/catalog";
import type { NodeConfigField } from "@/lib/nodes/types";
import { useWorkflowEditor } from "@/lib/workflows/store";
import {
  collectConnectablePorts,
  collectUpstreamFields,
  flattenSample,
  type FieldRef,
  type RefNode,
} from "@/lib/workflows/references";
import { captureWebhookSampleAction } from "@/app/(admin)/workflows/webhook-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/connections/copy-field";
import { WebhookFieldsDialog } from "./webhook-fields-dialog";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type TemplateOption = Option & {
  placeholders: { key: string; kind: "text" | "image" }[];
};
type FieldEl = HTMLInputElement | HTMLTextAreaElement | null;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** A dropdown of upstream fields that inserts the chosen token. */
function TokenMenu({
  fields,
  onPick,
}: {
  fields: FieldRef[];
  onPick: (token: string) => void;
}) {
  return (
    <div className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
      {fields.map((r) => (
        <button
          key={r.token}
          type="button"
          className="flex w-full flex-col items-start rounded px-2 py-1 text-left text-xs hover:bg-accent"
          onClick={() => onPick(r.token)}
        >
          <span className="font-medium">{r.label}</span>
          <span className="text-muted-foreground">{r.nodeLabel}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Single-line binding input: literal text plus a "Data" picker that inserts a
 * `{{nodeId.path}}` token at the cursor. Used for each template placeholder.
 */
function TokenBindingInput({
  value,
  onChange,
  fields,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  fields: FieldRef[];
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const insert = (token: string) => {
    const el = ref.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      onChange(value.slice(0, start) + token + value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value ? `${value} ${token}` : token);
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-start gap-1.5">
        <Input
          ref={ref}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        {fields.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1 px-2 text-xs"
            onClick={() => setOpen((o) => !o)}
          >
            <Braces className="size-3.5" /> Data
          </Button>
        ) : null}
      </div>
      {open ? <TokenMenu fields={fields} onPick={insert} /> : null}
    </div>
  );
}

/** Small pill marking a placeholder's kind. */
function KindBadge({ kind }: { kind: "text" | "image" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        kind === "image"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {kind}
    </span>
  );
}

export function NodeConfigPanel({
  connections,
  templates,
  webhookBaseUrl,
}: {
  connections: Option[];
  templates: TemplateOption[];
  webhookBaseUrl: string;
}) {
  const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId);
  const node = useWorkflowEditor((s) =>
    s.nodes.find((n) => n.id === s.selectedNodeId),
  );
  const nodes = useWorkflowEditor((s) => s.nodes);
  const edges = useWorkflowEditor((s) => s.edges);
  const workflowId = useWorkflowEditor((s) => s.workflowId);
  const updateNodeConfig = useWorkflowEditor((s) => s.updateNodeConfig);
  const setInputEdge = useWorkflowEditor((s) => s.setInputEdge);
  const clearInputEdge = useWorkflowEditor((s) => s.clearInputEdge);
  const removeNode = useWorkflowEditor((s) => s.removeNode);

  const fieldEls = useRef<Record<string, FieldEl>>({});
  const [openToken, setOpenToken] = useState<string | null>(null);
  const [capturing, startCapture] = useTransition();

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

  // Upstream field availability for tokens + input mapping.
  const refNodes: RefNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type ?? "",
    config: (n.data?.config ?? {}) as Record<string, unknown>,
  }));
  const refEdges = edges.map((e) => ({ source: e.source, target: e.target }));
  const upstreamFields = collectUpstreamFields(selectedNodeId, refNodes, refEdges);
  const connectable = collectConnectablePorts(selectedNodeId, refNodes, refEdges);

  const insertToken = (name: string, token: string) => {
    const el = fieldEls.current[name];
    const current = String(config[name] ?? "");
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      set(name, current.slice(0, start) + token + current.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      set(name, current ? `${current} ${token}` : token);
    }
    setOpenToken(null);
  };

  const firstOutput = (nodeId: string) => {
    const n = refNodes.find((x) => x.id === nodeId);
    return n ? getNodeMeta(n.type)?.outputs[0]?.id : undefined;
  };
  const currentSourceFor = (portId: string) => {
    const e = edges.find(
      (e) =>
        e.target === selectedNodeId &&
        (e.targetHandle ?? def.inputs[0]?.id) === portId,
    );
    if (!e) return "";
    return `${e.source}:${e.sourceHandle ?? firstOutput(e.source) ?? ""}`;
  };

  // --- Webhook node: URL + sample capture + field selection ---
  const sampleFields =
    (config.sampleFields as { path: string; preview?: string }[] | undefined) ??
    [];
  const selectedFields = (config.selectedFields as string[] | undefined) ?? [];

  const origin =
    webhookBaseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const capture = () => {
    if (!workflowId) return;
    startCapture(async () => {
      const payload = await captureWebhookSampleAction(workflowId, selectedNodeId);
      if (!payload) {
        toast.error("No event received yet", {
          description: "POST to the webhook URL first, then capture.",
        });
        return;
      }
      const fields = flattenSample(payload);
      // Keep any prior picks that still resolve in the fresh payload; a first
      // capture starts empty so the user deliberately chooses what to expose.
      const stillValid = (path: string) => {
        let cur: unknown = payload;
        for (const k of path.split(".")) {
          if (cur === null || typeof cur !== "object") return false;
          cur = (cur as Record<string, unknown>)[k];
          if (cur === undefined) return false;
        }
        return true;
      };
      updateNodeConfig(selectedNodeId, {
        ...config,
        sample: payload,
        sampleFields: fields,
        selectedFields: selectedFields.filter(stillValid),
      });
      toast.success(`Captured ${fields.length} fields`);
    });
  };

  const renderField = (f: NodeConfigField) => {
    const value = config[f.name];
    const str = value === undefined || value === null ? "" : String(value);
    const setRef = (el: FieldEl) => {
      fieldEls.current[f.name] = el;
    };

    switch (f.type) {
      case "textarea":
        return (
          <Textarea
            id={f.name}
            ref={setRef}
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
            ref={setRef}
            type={f.type === "password" ? "password" : "text"}
            value={str}
            placeholder={f.placeholder}
            onChange={(e) => set(f.name, e.target.value)}
            autoComplete="off"
          />
        );
    }
  };

  // Tokens can be inserted into free-text fields only.
  const supportsTokens = (t: NodeConfigField["type"]) =>
    t === "text" || t === "textarea";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-sm font-semibold">{def.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
      </div>

      {node.type === "webhook" ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <WebhookIcon className="size-4" /> Webhook URL
          </div>
          {workflowId ? (
            <>
              <CopyField
                value={`${origin}/api/hooks/${workflowId}/${selectedNodeId}`}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={capturing}
                onClick={capture}
              >
                {capturing ? "Listening…" : "Capture sample event"}
              </Button>
              {sampleFields.length > 0 ? (
                <div className="mt-1 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedFields.length === 0
                      ? "No fields selected yet — open to choose what's exposed downstream."
                      : `${selectedFields.length} of ${sampleFields.length} fields exposed downstream.`}
                  </p>
                  <WebhookFieldsDialog
                    sample={config.sample}
                    sampleFields={sampleFields}
                    selectedFields={selectedFields}
                    onChange={(next) => set("selectedFields", next)}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  POST to the URL, then capture to detect fields.
                </p>
              )}
            </>
          ) : (
            // A brand-new workflow has no id until its first (auto)save persists
            // the node — the URL appears on its own a moment later.
            <p className="text-xs text-muted-foreground">
              The webhook URL becomes available once the workflow is saved.
            </p>
          )}
        </div>
      ) : null}

      {def.inputs.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
            Inputs
          </p>
          {def.inputs.map((inp) => (
            <div key={inp.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`in-${inp.id}`}>{inp.label}</Label>
              <select
                id={`in-${inp.id}`}
                className={selectClass}
                value={currentSourceFor(inp.id)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) clearInputEdge(selectedNodeId, inp.id);
                  else {
                    const [src, sh] = v.split(":");
                    setInputEdge(selectedNodeId, inp.id, src, sh);
                  }
                }}
              >
                <option value="">— none —</option>
                {connectable.map((p) => (
                  <option
                    key={`${p.nodeId}:${p.portId}`}
                    value={`${p.nodeId}:${p.portId}`}
                  >
                    {p.nodeLabel} → {p.portLabel}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {def.configFields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={f.name}>{f.label}</Label>
            {supportsTokens(f.type) && upstreamFields.length > 0 ? (
              <div className="relative">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                  onClick={() =>
                    setOpenToken(openToken === f.name ? null : f.name)
                  }
                >
                  <Braces className="size-3.5" /> Insert
                </Button>
                {openToken === f.name ? (
                  <TokenMenu
                    fields={upstreamFields}
                    onPick={(token) => insertToken(f.name, token)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          {renderField(f)}
          {f.help ? (
            <p className="text-xs text-muted-foreground">{f.help}</p>
          ) : null}
        </div>
      ))}

      {node.type === "render-template" ? (
        <RenderTemplatePlaceholders
          templateId={String(config.templateId ?? "")}
          templates={templates}
          bindings={(config.placeholders ?? {}) as Record<string, unknown>}
          fields={upstreamFields}
          onChange={(next) => set("placeholders", next)}
        />
      ) : null}

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

/** Per-placeholder binding rows for the selected template (Render Template). */
function RenderTemplatePlaceholders({
  templateId,
  templates,
  bindings,
  fields,
  onChange,
}: {
  templateId: string;
  templates: TemplateOption[];
  bindings: Record<string, unknown>;
  fields: FieldRef[];
  onChange: (next: Record<string, unknown>) => void;
}) {
  const template = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );
  const placeholders = template?.placeholders ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
        Placeholders
      </p>
      {!templateId ? (
        <p className="text-xs text-muted-foreground">
          Select a template above to bind its placeholders.
        </p>
      ) : placeholders.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This template has no placeholders to fill.
        </p>
      ) : (
        placeholders.map((ph) => (
          <div key={ph.key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Label>{ph.key}</Label>
              <KindBadge kind={ph.kind} />
            </div>
            <TokenBindingInput
              value={String(bindings[ph.key] ?? "")}
              onChange={(v) => onChange({ ...bindings, [ph.key]: v })}
              fields={fields}
              placeholder={
                ph.kind === "image"
                  ? "Image URL — or insert data"
                  : "Text — or insert data"
              }
            />
          </div>
        ))
      )}
    </div>
  );
}
