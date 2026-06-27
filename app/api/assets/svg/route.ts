import { NextResponse } from "next/server";
import { importSvgAsset } from "@/lib/assets/service";
import { importSvgSchema, validateSvgCode } from "@/lib/assets/validation";
import { MAX_ASSET_BYTES } from "@/lib/assets/constants";

/** Import pasted SVG markup as a stored .svg asset (application/json). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importSvgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const check = validateSvgCode(parsed.data.code);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  if (Buffer.byteLength(parsed.data.code, "utf8") > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: `SVG is too large (max ${MAX_ASSET_BYTES / (1024 * 1024)} MB).` },
      { status: 413 },
    );
  }

  const asset = await importSvgAsset(parsed.data);
  return NextResponse.json(asset, { status: 201 });
}
