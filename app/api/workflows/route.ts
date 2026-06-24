import { NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/workflows/service";
import { workflowInputSchema } from "@/lib/workflows/validation";

export async function GET() {
  const rows = await listWorkflows();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = workflowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await createWorkflow({
    name: parsed.data.name,
    active: parsed.data.active,
    triggerConnectionId: parsed.data.triggerConnectionId ?? null,
    graph: parsed.data.graph,
  });
  return NextResponse.json(row);
}
