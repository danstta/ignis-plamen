import { NextResponse } from "next/server";
import { createAssetFromBytes, listAssets } from "@/lib/assets/service";
import {
  isAcceptedImageType,
  MAX_ASSET_BYTES,
  ACCEPTED_IMAGE_TYPES,
} from "@/lib/assets/constants";
import type { Asset } from "@/lib/assets/types";

export async function GET() {
  const rows = await listAssets();
  return NextResponse.json(rows);
}

/** Upload one or more files (multipart/form-data, field name "files"). */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a `files` field." },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const created: Asset[] = [];
  for (const file of files) {
    if (!isAcceptedImageType(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${file.type || "unknown"}" for ${file.name}. Allowed: ${ACCEPTED_IMAGE_TYPES.join(", ")}.`,
        },
        { status: 415 },
      );
    }
    if (file.size > MAX_ASSET_BYTES) {
      return NextResponse.json(
        { error: `${file.name} is too large (max ${MAX_ASSET_BYTES / (1024 * 1024)} MB).` },
        { status: 413 },
      );
    }
    const data = Buffer.from(await file.arrayBuffer());
    const asset = await createAssetFromBytes({
      name: file.name || "Untitled",
      contentType: file.type,
      data,
    });
    created.push(asset);
  }

  return NextResponse.json(created, { status: 201 });
}
