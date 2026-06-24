import { NextResponse } from "next/server";
import {
  deleteWorkflow,
  getWorkflow,
  updateWorkflow,
} from "@/lib/workflows/service";
import { workflowInputSchema } from "@/lib/workflows/validation";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/workflows/[id]">,
) {
  const { id } = await ctx.params;
  const row = await getWorkflow(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(
  req: Request,
  ctx: RouteContext<"/api/workflows/[id]">,
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = workflowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await updateWorkflow(id, {
    name: parsed.data.name,
    active: parsed.data.active,
    triggerConnectionId: parsed.data.triggerConnectionId ?? null,
    graph: parsed.data.graph,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/workflows/[id]">,
) {
  const { id } = await ctx.params;
  await deleteWorkflow(id);
  return new NextResponse(null, { status: 204 });
}
