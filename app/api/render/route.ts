import { NextResponse } from "next/server";
import { renderDocPage } from "@/lib/render/renderer";
import { getTemplate } from "@/lib/templates/service";
import {
  migrateDoc,
  type PlaceholderData,
  type TemplateDoc,
  type TemplateDocV1,
} from "@/lib/editor/types";

type RenderBody = {
  doc?: TemplateDoc | TemplateDocV1;
  templateId?: string;
  /** Which page to render (0-based). Defaults to the first page. */
  page?: number;
  data?: PlaceholderData;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RenderBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // getTemplate already normalizes to v2; an inline doc is migrated here so a
  // legacy single-page payload still renders.
  let doc: TemplateDoc | null = body.doc ? migrateDoc(body.doc) : null;
  if (!doc && body.templateId) {
    const row = await getTemplate(body.templateId);
    if (!row) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    doc = row.doc;
  }

  if (!doc || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    return NextResponse.json(
      { error: "Provide a valid `doc` or `templateId`." },
      { status: 400 },
    );
  }

  const pageIndex = body.page ?? 0;
  if (pageIndex < 0 || pageIndex >= doc.pages.length) {
    return NextResponse.json(
      { error: `Page ${pageIndex} is out of range (0–${doc.pages.length - 1}).` },
      { status: 400 },
    );
  }

  try {
    const png = await renderDocPage(doc, pageIndex, body.data);
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        // Lets clients (e.g. the editor's "export all pages") know the total.
        "X-Page-Count": String(doc.pages.length),
      },
    });
  } catch (err) {
    console.error("[/api/render] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
