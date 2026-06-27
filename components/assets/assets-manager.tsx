"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Code2,
  Copy,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import type { Asset } from "@/lib/assets/types";
import {
  deleteAsset as deleteAssetReq,
  importSvgAsset,
  renameAsset as renameAssetReq,
  uploadAssetFiles,
} from "@/lib/assets/client";
import { ASSET_ACCEPT_ATTR } from "@/lib/assets/constants";
import { cn } from "@/lib/utils";
import { AssetThumb } from "./asset-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsManager({ initialAssets }: { initialAssets: Asset[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const created = await uploadAssetFiles(files);
      setAssets((prev) => [...created, ...prev]);
      toast.success(
        created.length === 1 ? "Asset uploaded" : `${created.length} assets uploaded`,
      );
    } catch (err) {
      toast.error("Upload failed", { description: String(err) });
    } finally {
      setUploading(false);
    }
  }

  function onAdded(asset: Asset) {
    setAssets((prev) => [asset, ...prev]);
  }

  async function rename(asset: Asset) {
    const name = window.prompt("Rename asset", asset.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) return;
    try {
      const updated = await renameAssetReq(asset.id, trimmed);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? updated : a)));
    } catch (err) {
      toast.error("Rename failed", { description: String(err) });
    }
  }

  async function copyUrl(asset: Asset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      toast.success("URL copied");
    } catch {
      toast.error("Couldn't copy URL");
    }
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`Delete "${asset.name}"? This can't be undone.`)) return;
    const prev = assets;
    setAssets((cur) => cur.filter((a) => a.id !== asset.id));
    try {
      await deleteAssetReq(asset.id);
    } catch (err) {
      setAssets(prev); // restore on failure
      toast.error("Delete failed", { description: String(err) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload SVGs and images, then drop them onto any template from the editor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportSvgDialog onAdded={onAdded} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="size-4" /> {uploading ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ASSET_ACCEPT_ATTR}
            multiple
            hidden
            onChange={(e) => {
              handleFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-xl border border-dashed p-4 transition-colors",
          dragOver ? "border-foreground/40 bg-muted/50" : "border-border",
        )}
      >
        {assets.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-sm text-muted-foreground">No assets yet.</p>
            <p className="text-xs text-muted-foreground/70">
              Drag &amp; drop files here, or use Upload / Import SVG.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets.map((asset) => (
              <div key={asset.id} className="group flex flex-col gap-1.5">
                <div className="relative">
                  <AssetThumb asset={asset} />
                  <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="secondary"
                            size="icon"
                            className="size-7 shadow-sm"
                            aria-label={`Actions for ${asset.name}`}
                          />
                        }
                      >
                        <MoreVertical className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => rename(asset)}>
                          <Pencil className="size-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyUrl(asset)}>
                          <Copy className="size-4" /> Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => remove(asset)}
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(asset.bytes)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportSvgDialog({ onAdded }: { onAdded: (asset: Asset) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!code.trim()) {
      toast.error("Paste some SVG markup first.");
      return;
    }
    startTransition(async () => {
      try {
        const asset = await importSvgAsset({
          name: name.trim() || undefined,
          code,
        });
        onAdded(asset);
        toast.success("SVG imported");
        setOpen(false);
        setName("");
        setCode("");
      } catch (err) {
        toast.error("Import failed", { description: String(err) });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Code2 className="size-4" /> Import SVG
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import SVG as code</DialogTitle>
          <DialogDescription>
            Paste raw SVG markup. It&apos;s saved as a .svg file you can reuse like any
            other asset.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svg-name">Name (optional)</Label>
            <Input
              id="svg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Logo mark"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svg-code">SVG code</Label>
            <Textarea
              id="svg-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="<svg xmlns='http://www.w3.org/2000/svg' …>…</svg>"
              className="min-h-40 font-mono text-xs"
              spellCheck={false}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
