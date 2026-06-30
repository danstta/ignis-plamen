import { promises as fs } from "node:fs";
import path from "node:path";
import { FONTS, type FontWeight } from "@/lib/render/font-registry";
import { fontFormat, fontSourceFaceUrl } from "@/lib/render/font-assets";

export const runtime = "nodejs";

const FONT_CACHE = "public, max-age=31536000, immutable";
const MIME_BY_FORMAT: Record<string, string> = {
  woff: "font/woff",
  truetype: "font/ttf",
  opentype: "font/otf",
};

function parseWeight(raw: string): FontWeight | null {
  const n = Number(raw);
  return Number.isInteger(n) &&
    [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(n)
    ? (n as FontWeight)
    : null;
}

function fontResponse(data: ArrayBuffer, format: string) {
  return new Response(data, {
    headers: {
      "Content-Type": MIME_BY_FORMAT[format] ?? "application/octet-stream",
      "Cache-Control": FONT_CACHE,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ family: string; weight: string; subset: string }> },
) {
  const { family, weight: rawWeight, subset } = await params;
  const def = FONTS[family];
  const weight = parseWeight(rawWeight);
  if (!def || !weight || !def.weights.includes(weight)) {
    return new Response(null, { status: 404 });
  }

  if (def.kind === "fontsource") {
    if (!def.subsets.includes(subset)) {
      return new Response(null, { status: 404 });
    }
    const upstream = await fetch(fontSourceFaceUrl(def, subset, weight), {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!upstream.ok) {
      return new Response(null, { status: 404 });
    }
    return fontResponse(await upstream.arrayBuffer(), "woff");
  }

  if (subset !== "local") {
    return new Response(null, { status: 404 });
  }

  const file = def.file(weight);
  const format = fontFormat(file);
  if (!format) {
    return new Response(null, { status: 404 });
  }

  try {
    const data = await fs.readFile(path.join(process.cwd(), "public", "fonts", file));
    const bytes = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    return fontResponse(bytes, format);
  } catch {
    return new Response(null, { status: 404 });
  }
}
