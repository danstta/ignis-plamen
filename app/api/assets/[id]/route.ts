import { NextResponse } from "next/server";
import { deleteAsset, renameAsset } from "@/lib/assets/service";
import { renameAssetSchema } from "@/lib/assets/validation";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = renameAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const asset = await renameAsset(id, parsed.data.name);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json(asset);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteAsset(id);
  if (!ok) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
