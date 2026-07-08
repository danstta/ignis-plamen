"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FlaskConical,
  GitBranch,
  Loader2,
  Play,
  Plus,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getNodeMeta, listNodeCatalog } from "@/lib/nodes/catalog";
import type { NodeConfigField } from "@/lib/nodes/types";
import type { WorkflowGraph } from "@/lib/workflows/types";
import type { TestNodeResult, WorkflowTestResult } from "@/lib/workflows/test-runner";
import {
  CONDITION_OP_LABELS,
  CONDITION_OPS,
  ROUTER_TYPE_ID,
  isUnaryOp,
  type ConditionOp,
} from "@/lib/workflows/conditions";
import {
  routerBranchColumns,
  type RouterBranch,
} from "@/lib/nodes/router/meta";
import {
  NOTION_UPDATE_PAGE_TYPE_ID,
  notionPropertyTypeLabels,
  notionPropertyTypes,
  type NotionPropertyType,
  type NotionPropertyUpdate,
} from "@/lib/nodes/notion-update-page/meta";
import { CURATE_IMAGES_TYPE_ID } from "@/lib/nodes/curate-images/meta";
import { PREVIEW_DESIGN_IMAGE_TYPE_ID } from "@/lib/nodes/preview-design-image/meta";
import { RENDER_TEMPLATE_BATCH_TYPE_ID } from "@/lib/nodes/render-template-batch/meta";
import {
  FIND_LOCATION_IMAGES_TYPE_ID,
  MAX_LOCATION_IMAGE_QUERIES,
} from "@/lib/nodes/find-location-images/meta";
import { useWorkflowEditor } from "@/lib/workflows/store";
import {
  collectConnectablePorts,
  collectUpstreamFields,
  flattenSample,
  resolvePathMatches,
  toStructuralPath,
  type FieldRef,
  type RefNode,
} from "@/lib/workflows/references";
import { captureWebhookSampleAction } from "@/app/(admin)/workflows/webhook-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyField } from "@/components/connections/copy-field";
import { PayloadFieldSelector, WebhookFieldsDialog } from "./webhook-fields-dialog";
import { cn } from "@/lib/utils";

type ConnectionOption = {
  id: string;
  name: string;
  type: string;
  models: { value: string; label: string }[];
};
type Option = { id: string; name: string };
type TemplateOption = Option & {
  placeholders: { key: string; kind: "text" | "image" }[];
};
type FieldEl = HTMLInputElement | HTMLTextAreaElement | null;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const nativeOptionClass = "bg-background text-foreground";
const nativeOptGroupClass = "bg-background text-muted-foreground";
const DEFAULT_TEST_EVENT = {
  body: {
    location: "Belgrade Youth Center",
    caption: "Call for participants",
  },
  headers: {},
  query: {},
};

function groupByNode<T extends { nodeId: string; nodeLabel: string }>(
  refs: T[],
): { nodeId: string; nodeLabel: string; refs: T[] }[] {
  const groups = new Map<string, { nodeId: string; nodeLabel: string; refs: T[] }>();
  for (const ref of refs) {
    const group = groups.get(ref.nodeId);
    if (group) group.refs.push(ref);
    else groups.set(ref.nodeId, { nodeId: ref.nodeId, nodeLabel: ref.nodeLabel, refs: [ref] });
  }
  return [...groups.values()];
}

/** A dropdown of upstream fields that inserts the chosen token. */
function TokenMenu({
  fields,
  onPick,
}: {
  fields: FieldRef[];
  onPick: (token: string) => void;
}) {
  const groups = groupByNode(fields);

  return (
    <div className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
      {groups.map((group) => (
        <div key={group.nodeId} className="py-0.5">
          <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {group.nodeLabel}
          </p>
          {group.refs.map((r) => (
            <button
              key={r.token}
              type="button"
              className="flex w-full flex-col items-start rounded px-2 py-1 text-left text-xs hover:bg-accent"
              onClick={() => onPick(r.token)}
            >
              <span className="font-medium">{r.label}</span>
            </button>
          ))}
        </div>
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
  enabledNodeTypeIds,
}: {
  connections: ConnectionOption[];
  templates: TemplateOption[];
  webhookBaseUrl: string;
  enabledNodeTypeIds: string[];
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
  const [runningTest, setRunningTest] = useState(false);
  const [testNode, setTestNode] = useState<TestNodeResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testTargetNodeId, setTestTargetNodeId] = useState<string | null>(null);
  const [testRunKey, setTestRunKey] = useState(0);
  const capturedSample = useMemo(() => {
    const webhook = nodes.find((n) => n.type === "webhook" && n.data.config.sample);
    return webhook?.data.config.sample;
  }, [nodes]);

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
  const setConfig = (patch: Record<string, unknown>) =>
    updateNodeConfig(selectedNodeId, { ...config, ...patch });
  const set = (name: string, value: unknown) =>
    setConfig({ [name]: value });

  // Upstream field availability for tokens + input mapping.
  const refNodes: RefNode[] = [...nodes]
    .sort(
      (a, b) =>
        a.position.y - b.position.y ||
        a.position.x - b.position.x ||
        a.id.localeCompare(b.id),
    )
    .map((n) => ({
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
  const selectedOutputFields =
    node.type === "webhook"
      ? selectedFields
      : ((config.selectedOutputFields as string[] | undefined) ?? []);
  const activeTestNode = testTargetNodeId === selectedNodeId ? testNode : null;
  const activeTestError = testTargetNodeId === selectedNodeId ? testError : null;
  const setSelectedOutputFields = (next: string[]) => {
    set(node.type === "webhook" ? "selectedFields" : "selectedOutputFields", next);
  };

  const runNodeTest = async () => {
    const graph: WorkflowGraph = useWorkflowEditor.getState().toGraph();
    const trigger = (capturedSample ?? DEFAULT_TEST_EVENT) as Record<string, unknown>;

    setRunningTest(true);
    setTestTargetNodeId(selectedNodeId);
    setTestNode(null);
    setTestError(null);
    try {
      const res = await fetch("/api/workflows/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph,
          trigger,
          targetNodeId: selectedNodeId,
        }),
      });
      const data = (await res.json()) as WorkflowTestResult | { error?: unknown };
      if (!res.ok) {
        throw new Error(
          "error" in data && data.error ? JSON.stringify(data.error) : res.statusText,
        );
      }
      const result = data as WorkflowTestResult;
      const target = result.nodes.find((n) => n.nodeId === selectedNodeId) ?? null;
      setTestNode(target);
      setTestRunKey((key) => key + 1);
      if (!target) setTestError("This node was not reached by the sample event.");
      else if (target.status === "error") setTestError(target.error ?? "Node failed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestError(message);
      toast.error("Test run failed", { description: message });
    } finally {
      setRunningTest(false);
    }
  };

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
      // Carry over prior picks that still resolve in the fresh payload, upgrading
      // any legacy literal-index paths to structural (`*`) form and de-duping. A
      // first capture has none, so the user deliberately chooses what to expose.
      const keptSelected = [
        ...new Set(selectedFields.map(toStructuralPath)),
      ].filter((path) => resolvePathMatches(payload, path.split(".")).length > 0);
      updateNodeConfig(selectedNodeId, {
        ...config,
        sample: payload,
        sampleFields: fields,
        selectedFields: keptSelected,
      });
      toast.success(`Captured ${fields.length} fields`);
    });
  };

  const connectionOptionsForField = (f: NodeConfigField) => {
    if (!f.connectionTypes?.length) return connections;
    const allowed = new Set(f.connectionTypes);
    return connections.filter((connection) => allowed.has(connection.type));
  };

  const modelOptionsForField = (f: NodeConfigField) => {
    const connectionField = f.modelSource?.connectionField;
    if (!connectionField) return f.options ?? [];
    const connectionId = String(config[connectionField] ?? "");
    return (
      connections.find((connection) => connection.id === connectionId)?.models ?? []
    );
  };

  const providerLabel = (type: string) => {
    if (type === "openai") return "OpenAI";
    if (type === "azure-foundry") return "Azure";
    return type;
  };

  const renderField = (f: NodeConfigField) => {
    const value =
      config[f.name] ??
      (f.legacyValueField ? config[f.legacyValueField] : undefined);
    const str = value === undefined || value === null ? "" : String(value);
    const setRef = (el: FieldEl) => {
      fieldEls.current[f.name] = el;
    };

    switch (f.type) {
      case "boolean":
        return (
          <div className="flex h-9 items-center gap-2">
            <Switch
              id={f.name}
              checked={value === true || value === "true"}
              onCheckedChange={(checked) => set(f.name, checked)}
            />
            <span className="text-xs text-muted-foreground">
              {value === true || value === "true" ? "On" : "Off"}
            </span>
          </div>
        );
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
      case "checkbox-group": {
        const options = f.options ?? [];
        const legacyValue =
          f.legacyValueMap && typeof config[f.legacyValueMap.field] === "string"
            ? f.legacyValueMap.values[String(config[f.legacyValueMap.field])]
            : undefined;
        const currentValues = Array.isArray(value)
          ? value
          : Array.isArray(legacyValue)
            ? legacyValue
            : Array.isArray(f.defaultValue)
              ? f.defaultValue
              : [];
        const selectedValues = currentValues
          .map((item) => String(item))
          .filter((item) => options.some((option) => option.value === item));

        return (
          <div className="grid gap-1.5">
            {options.map((option) => {
              const checked = selectedValues.includes(option.value);
              const disableLast = checked && selectedValues.length === 1;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent",
                    checked && "border-ring bg-accent/50",
                    disableLast && "cursor-default opacity-80",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-foreground"
                    checked={checked}
                    disabled={disableLast}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selectedValues, option.value]
                        : selectedValues.filter((item) => item !== option.value);
                      set(f.name, next);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        );
      }
      case "select": {
        const options = modelOptionsForField(f);
        const selectValue = options.some((o) => o.value === str) ? str : "";
        const placeholder = f.modelSource
          ? options.length > 0
            ? "- select model -"
            : String(config[f.modelSource.connectionField] ?? "")
              ? "- no models configured -"
              : "- select connection first -"
          : "- select -";
        return (
          <select
            id={f.name}
            className={selectClass}
            value={selectValue}
            disabled={f.modelSource ? options.length === 0 : false}
            onChange={(e) => set(f.name, e.target.value)}
          >
            <option value="" className={nativeOptionClass}>
              {placeholder}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value} className={nativeOptionClass}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      case "connection":
      case "template": {
        const options =
          f.type === "connection" ? connectionOptionsForField(f) : templates;
        return (
          <select
            id={f.name}
            className={selectClass}
            value={str}
            onChange={(e) => {
              const nextValue = e.target.value;
              const patch: Record<string, unknown> = { [f.name]: nextValue };
              for (const dependent of def.configFields) {
                if (dependent.modelSource?.connectionField !== f.name) continue;
                patch[dependent.name] =
                  connections.find((connection) => connection.id === nextValue)
                    ?.models[0]?.value ?? "";
              }
              setConfig(patch);
            }}
          >
            <option value="" className={nativeOptionClass}>
              — select —
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id} className={nativeOptionClass}>
                {f.type === "connection"
                  ? `${o.name} - ${providerLabel((o as ConnectionOption).type)}`
                  : o.name}
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

      <Tabs defaultValue="config" className="min-w-0 gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex min-w-0 flex-col gap-4">
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

      {node.type === ROUTER_TYPE_ID ? (
        <RouterBranchesEditor
          routerId={selectedNodeId}
          config={config}
          fields={upstreamFields}
          enabledNodeTypeIds={enabledNodeTypeIds}
        />
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
                <option value="" className={nativeOptionClass}>
                  — none —
                </option>
                {groupByNode(connectable).map((group) => (
                  <optgroup
                    key={group.nodeId}
                    label={group.nodeLabel}
                    className={nativeOptGroupClass}
                  >
                    {group.refs.map((p) => (
                      <option
                        key={`${p.nodeId}:${p.portId}`}
                        value={`${p.nodeId}:${p.portId}`}
                        className={nativeOptionClass}
                      >
                        {p.portLabel}
                      </option>
                    ))}
                  </optgroup>
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

      {node.type === FIND_LOCATION_IMAGES_TYPE_ID ? (
        <FindLocationQueriesEditor
          queries={locationQueriesFromConfig(config)}
          fields={upstreamFields}
          onChange={(next) =>
            setConfig({
              locationQueries: next,
              locationQuery: next[0] ?? "",
            })
          }
        />
      ) : null}

      {node.type === "render-template" ||
      node.type === RENDER_TEMPLATE_BATCH_TYPE_ID ||
      node.type === PREVIEW_DESIGN_IMAGE_TYPE_ID ||
      node.type === CURATE_IMAGES_TYPE_ID ? (
        <RenderTemplatePlaceholders
          templateId={String(config.templateId ?? "")}
          templates={templates}
          bindings={(config.placeholders ?? {}) as Record<string, unknown>}
          fields={upstreamFields}
          onChange={(next) => set("placeholders", next)}
        />
      ) : null}

      {node.type === NOTION_UPDATE_PAGE_TYPE_ID ? (
        <NotionPropertiesEditor
          properties={(config.properties ?? []) as NotionPropertyUpdate[]}
          fields={upstreamFields}
          onChange={(next) => set("properties", next)}
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
        </TabsContent>

        <TabsContent value="test" className="flex min-w-0 flex-col gap-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FlaskConical className="size-4" /> Test this node
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Runs this node with the current config and the latest captured
                  webhook event.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={runningTest}
                onClick={() => void runNodeTest()}
              >
                {runningTest ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {runningTest ? "Testing" : "Run"}
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              {capturedSample ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  Using captured sample event
                </>
              ) : (
                <>
                  <CircleAlert className="size-3.5 text-amber-500" />
                  No captured event yet; using the default sample
                </>
              )}
            </p>
          </div>

          {activeTestError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-medium">
                <XCircle className="size-4" /> Test failed
              </p>
              <p className="mt-1 text-xs">{activeTestError}</p>
            </div>
          ) : null}

          {activeTestNode?.outputs ? (
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Output fields</p>
                  <p className="text-xs text-muted-foreground">
                    Select the paths this node exposes to next steps.
                  </p>
                </div>
                <span className="rounded bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {activeTestNode.status}
                </span>
              </div>
              <PayloadFieldSelector
                key={`${selectedNodeId}-${testRunKey}`}
                sample={activeTestNode.outputs}
                selectedFields={selectedOutputFields}
                onChange={setSelectedOutputFields}
                maxHeightClassName="max-h-[calc(100svh-24rem)]"
                emptyText="This node returned no output fields."
              />
            </div>
          ) : !activeTestError ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Run the node to inspect its output and choose fields for downstream
              steps.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function locationQueriesFromConfig(config: Record<string, unknown>): string[] {
  const queries = Array.isArray(config.locationQueries)
    ? config.locationQueries.map((query) =>
        typeof query === "string" ? query : "",
      )
    : [];
  if (queries.length > 0) return queries;
  const legacy = typeof config.locationQuery === "string" ? config.locationQuery : "";
  return [legacy];
}

function FindLocationQueriesEditor({
  queries,
  fields,
  onChange,
}: {
  queries: string[];
  fields: FieldRef[];
  onChange: (next: string[]) => void;
}) {
  const update = (index: number, value: string) => {
    const next = queries.map((query, i) => (i === index ? value : query));
    onChange(next);
  };
  const canAdd = queries.length < MAX_LOCATION_IMAGE_QUERIES;
  const add = () => {
    if (canAdd) onChange([...queries, ""]);
  };
  const remove = (index: number) => {
    const next = queries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
            Location queries
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search each location with the same providers and result limits.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={!canAdd}
          onClick={add}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {queries.map((query, index) => (
          <div key={index} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <Label className="sr-only">Location query {index + 1}</Label>
              <TokenBindingInput
                value={query}
                onChange={(value) => update(index, value)}
                fields={fields}
                placeholder="Venue, city, country, or insert webhook data"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remove query"
              disabled={queries.length === 1}
              onClick={() => remove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dynamic property mapping rows for the Notion Update Page node. */
function NotionPropertiesEditor({
  properties,
  fields,
  onChange,
}: {
  properties: NotionPropertyUpdate[];
  fields: FieldRef[];
  onChange: (next: NotionPropertyUpdate[]) => void;
}) {
  const addProperty = () =>
    onChange([
      ...properties,
      {
        id: crypto.randomUUID(),
        name: "",
        type: "rich_text",
        value: "",
      },
    ]);

  const updateProperty = (
    id: string,
    patch: Partial<Omit<NotionPropertyUpdate, "id">>,
  ) => {
    onChange(properties.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeProperty = (id: string) => {
    onChange(properties.filter((row) => row.id !== id));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
            Properties
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose the Notion fields to change and bind their values from previous steps.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={addProperty}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>

      {properties.length === 0 ? (
        <button
          type="button"
          className="rounded-md border border-dashed p-3 text-left text-xs text-muted-foreground hover:border-foreground/20 hover:bg-accent"
          onClick={addProperty}
        >
          Add a property update, then insert webhook or previous-step data as its value.
        </button>
      ) : (
        properties.map((row) => (
          <div key={row.id} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-1.5">
              <Input
                value={row.name}
                placeholder="Property name"
                onChange={(e) => updateProperty(row.id, { name: e.target.value })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                title="Remove property"
                onClick={() => removeProperty(row.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <select
              className={selectClass}
              value={row.type}
              onChange={(e) =>
                updateProperty(row.id, {
                  type: e.target.value as NotionPropertyType,
                })
              }
            >
              {notionPropertyTypes.map((type) => (
                <option key={type} value={type} className={nativeOptionClass}>
                  {notionPropertyTypeLabels[type]}
                </option>
              ))}
            </select>
            <TokenBindingInput
              value={String(row.value ?? "")}
              onChange={(value) => updateProperty(row.id, { value })}
              fields={fields}
              placeholder="Value - or insert data"
            />
          </div>
        ))
      )}
    </div>
  );
}

/** Per-placeholder binding rows for the selected template. */
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

/** The branch + condition editor shown when a Router node is selected. */
function RouterBranchesEditor({
  routerId,
  config,
  fields,
  enabledNodeTypeIds,
}: {
  routerId: string;
  config: Record<string, unknown>;
  fields: FieldRef[];
  enabledNodeTypeIds: string[];
}) {
  const updateNodeConfig = useWorkflowEditor((s) => s.updateNodeConfig);
  const addRouterBranch = useWorkflowEditor((s) => s.addRouterBranch);
  const removeRouterBranch = useWorkflowEditor((s) => s.removeRouterBranch);
  const removeNode = useWorkflowEditor((s) => s.removeNode);
  const nodes = useWorkflowEditor((s) => s.nodes);

  const branches = (config.branches as RouterBranch[] | undefined) ?? [];
  const columns = routerBranchColumns(config);

  const updateBranch = (branchId: string, patch: Partial<RouterBranch>) => {
    const next = branches.map((b) =>
      b.id === branchId ? { ...b, ...patch } : b,
    );
    updateNodeConfig(routerId, { ...config, branches: next });
    if (patch.routeMode === "redoPrevious") {
      nodes
        .filter(
          (n) =>
            n.data.branch?.routerId === routerId &&
            n.data.branch.branchId === branchId,
        )
        .forEach((n) => removeNode(n.id));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
          Branches
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-xs"
          onClick={() => addRouterBranch(routerId)}
        >
          <Plus className="size-3.5" /> Add branch
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Evaluated top to bottom; the first branch whose condition holds runs. If
        none match, Else runs.
      </p>

      {columns.map((col) => {
        const branch = branches.find((b) => b.id === col.branchId);
        return (
          <div
            key={col.branchId}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <GitBranch className="size-3.5 shrink-0 text-rose-500" />
              {col.isElse || !branch ? (
                <span className="text-sm font-medium">Else</span>
              ) : (
                <>
                  <Input
                    value={branch.label}
                    placeholder="Branch name"
                    className="h-8"
                    onChange={(e) =>
                      updateBranch(col.branchId, { label: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="ml-auto size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Delete branch"
                    onClick={() => removeRouterBranch(routerId, col.branchId)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>

            {!col.isElse && branch ? (
              <>
                <ConditionRow
                  branch={branch}
                  fields={fields}
                  onChange={(patch) => updateBranch(col.branchId, patch)}
                />
                <BranchRouteRow
                  branch={branch}
                  onChange={(patch) => updateBranch(col.branchId, patch)}
                />
              </>
            ) : null}

            {branch?.routeMode === "redoPrevious" ? (
              <p className="rounded border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
                This branch reruns the previous step, then evaluates this router
                again.
              </p>
            ) : (
              <BranchStepList
                routerId={routerId}
                branchId={col.branchId}
                enabledNodeTypeIds={enabledNodeTypeIds}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What a matched branch does after its condition passes. */
function BranchRouteRow({
  branch,
  onChange,
}: {
  branch: RouterBranch;
  onChange: (patch: Partial<RouterBranch>) => void;
}) {
  const routeMode = branch.routeMode ?? "branch";
  const maxAttempts = branch.maxAttempts ?? 3;

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Then</Label>
      <select
        className={selectClass}
        value={routeMode}
        onChange={(e) =>
          onChange({ routeMode: e.target.value as RouterBranch["routeMode"] })
        }
      >
        <option value="branch" className={nativeOptionClass}>
          Run branch steps
        </option>
        <option value="redoPrevious" className={nativeOptionClass}>
          Redo previous step
        </option>
      </select>
      {routeMode === "redoPrevious" ? (
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-muted-foreground">
            Attempts
          </Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={(e) =>
              onChange({
                maxAttempts: Number.parseInt(e.target.value, 10) || 1,
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/** Left operand + operator + right operand for one branch's condition. */
function ConditionRow({
  branch,
  fields,
  onChange,
}: {
  branch: RouterBranch;
  fields: FieldRef[];
  onChange: (patch: Partial<RouterBranch>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">If…</Label>
      <TokenBindingInput
        value={branch.left}
        onChange={(v) => onChange({ left: v })}
        fields={fields}
        placeholder="Value — or insert data"
      />
      <div className="flex gap-1.5">
        <select
          className={selectClass}
          value={branch.op}
          onChange={(e) => onChange({ op: e.target.value as ConditionOp })}
        >
          {CONDITION_OPS.map((op) => (
            <option key={op} value={op} className={nativeOptionClass}>
              {CONDITION_OP_LABELS[op]}
            </option>
          ))}
        </select>
        {!isUnaryOp(branch.op) ? (
          <Input
            value={branch.right}
            placeholder="Compare to…"
            onChange={(e) => onChange({ right: e.target.value })}
          />
        ) : null}
      </div>
    </div>
  );
}

/** The ordered steps inside one branch lane, with add/reorder/delete controls. */
function BranchStepList({
  routerId,
  branchId,
  enabledNodeTypeIds,
}: {
  routerId: string;
  branchId: string;
  enabledNodeTypeIds: string[];
}) {
  const steps = useWorkflowEditor((s) =>
    s.nodes.filter(
      (n) =>
        n.data.branch?.routerId === routerId &&
        n.data.branch.branchId === branchId,
    ),
  );
  const addNodeToBranch = useWorkflowEditor((s) => s.addNodeToBranch);
  const moveNode = useWorkflowEditor((s) => s.moveNode);
  const removeNode = useWorkflowEditor((s) => s.removeNode);
  const selectNode = useWorkflowEditor((s) => s.selectNode);

  const enabled = new Set(enabledNodeTypeIds);
  const stepTypes = listNodeCatalog().filter(
    (t) =>
      enabled.has(t.id) && t.category !== "trigger" && t.id !== ROUTER_TYPE_ID,
  );

  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((n, i) => {
        const meta = getNodeMeta(n.type ?? "");
        return (
          <div
            key={n.id}
            className="flex items-center gap-0.5 rounded border bg-background px-2 py-1 text-xs"
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left font-medium"
              onClick={() => selectNode(n.id)}
            >
              {meta?.label ?? n.type}
            </button>
            <button
              type="button"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => moveNode(n.id, "up")}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={i === steps.length - 1}
              onClick={() => moveNode(n.id, "down")}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete step"
              onClick={() => removeNode(n.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        );
      })}
      <select
        className={`${selectClass} h-8`}
        value=""
        onChange={(e) => {
          if (e.target.value) addNodeToBranch(e.target.value, routerId, branchId);
        }}
      >
        <option value="" className={nativeOptionClass}>
          + Add step…
        </option>
        {stepTypes.map((t) => (
          <option key={t.id} value={t.id} className={nativeOptionClass}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
