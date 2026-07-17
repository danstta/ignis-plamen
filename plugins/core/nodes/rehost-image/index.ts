import { storage } from "@/lib/storage";
import type { NodeDefinition } from "@/lib/nodes/types";
import { rehostImageMeta, type RehostImageConfig } from "./meta";

/**
 * Copies an image from a (typically expiring) source URL into our own storage,
 * returning a stable, permanent URL on the `url` output.
 *
 * Notion file properties — like many providers' assets — hand out presigned
 * URLs that expire within the hour. Passing such a URL straight to the renderer
 * works only if the render happens immediately; insert this node before any
 * pause (e.g. Manual Review) so the bytes are captured up front and a later
 * render can't fail on a dead link. Bind the downstream image placeholder to
 * `{{<thisNodeId>.url}}` instead of the raw source token.
 *
 * A blank/missing source is not an error: it passes through an empty url so an
 * optional image simply renders as its placeholder box rather than failing the
 * run. A *present* source that can't be fetched throws — an explicitly bound but
 * dead link is a real problem worth surfacing.
 */

/** Cap protecting the worker from pathological downloads (phone photos are ~5–10MB). */
const MAX_BYTES = 25 * 1024 * 1024;

/** Map a content-type to a file extension; falls back to the URL's own extension. */
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function extFor(contentType: string, url: string): string {
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (EXT_BY_TYPE[ct]) return EXT_BY_TYPE[ct];
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    // not a parseable URL — fall through to the default
  }
  return "img";
}

export const rehostImageNode: NodeDefinition<RehostImageConfig> = {
  ...rehostImageMeta,

  async run(ctx) {
    const source = String(ctx.config.source ?? "").trim();
    if (!source) {
      await ctx.log("no source URL — passing through empty");
      return { type: "output", outputs: { url: "" } };
    }

    // A data: URL is already self-contained and permanent — nothing to rehost.
    if (source.startsWith("data:")) {
      await ctx.log("source is a data: URL — passing through unchanged");
      return { type: "output", outputs: { url: source } };
    }

    if (!/^https?:\/\//i.test(source)) {
      throw new Error(`Unsupported source URL scheme: ${source.slice(0, 60)}`);
    }

    const res = await fetch(source);
    if (!res.ok) {
      // Notion's presigned S3 URLs answer 403 once expired — a clear signal that
      // this node ran too late (e.g. after a pause) or the link was already stale.
      throw new Error(`Fetch failed (${res.status} ${res.statusText})`);
    }

    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new Error(`Image too large: ${declared} bytes (max ${MAX_BYTES})`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`Image too large: ${bytes.byteLength} bytes (max ${MAX_BYTES})`);
    }

    const contentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    const ext = extFor(contentType, source);
    const { url } = await storage().put(
      `rehosted/${crypto.randomUUID()}.${ext}`,
      bytes,
      contentType,
    );
    await ctx.log(`rehosted ${bytes.byteLength}B (${contentType}) -> ${url}`);

    return { type: "output", outputs: { url } };
  },
};
