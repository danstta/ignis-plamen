"use client";

import { useEffect, useRef, useState } from "react";
import { Images, Upload } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/lib/editor/store";
import { createImage } from "@/lib/editor/factory";
import { fetchAssets, uploadAssetFiles } from "@/lib/assets/client";
import { ASSET_ACCEPT_ATTR } from "@/lib/assets/constants";
import type { Asset } from "@/lib/assets/types";
import { AssetThumb } from "@/components/assets/asset-thumb";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Editor insert panel: browse the Assets library and click an asset to drop it on
 * the canvas as an image element. Fetches lazily the first time it's opened.
 */
export function AssetsPanel() {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const nextAssets = await fetchAssets();
      setError(null);
      setAssets(nextAssets);
    } catch (err) {
      setError(String(err));
    }
  }

  // Load on first open; keep the list around afterwards.
  useEffect(() => {
    if (!open || assets !== null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [open, assets]);

  function insert(asset: Asset) {
    const state = useEditor.getState();
    const el = createImage(state.doc, { src: asset.url });
    state.addElement(el);
    state.select([el.id]);
    setOpen(false);
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const created = await uploadAssetFiles(files);
      setAssets((prev) => [...created, ...(prev ?? [])]);
      toast.success(
        created.length === 1 ? "Asset uploaded" : `${created.length} assets uploaded`,
      );
    } catch (err) {
      toast.error("Upload failed", { description: String(err) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 gap-1" />}
      >
        <Images className="size-4" /> Assets
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-sm font-medium">Assets</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-3.5" /> {uploading ? "Uploading…" : "Upload"}
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

        {error ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Couldn&apos;t load assets. {error}
          </p>
        ) : assets === null ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No assets yet. Upload one, or add them from the Assets page.
          </p>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-auto">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => insert(asset)}
                title={asset.name}
                className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AssetThumb
                  asset={asset}
                  className="transition-colors hover:border-foreground/30"
                />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
