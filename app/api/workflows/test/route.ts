import { NextResponse } from "next/server";
import { z } from "zod";
import { runWorkflowTest } from "@/lib/workflows/test-runner";
import { workflowGraphSchema } from "@/lib/workflows/validation";

const testRequestSchema = z.object({
  graph: workflowGraphSchema,
  trigger: z.record(z.string(), z.unknown()).default({}),
  targetNodeId: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = testRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runWorkflowTest({
    graph: parsed.data.graph,
    trigger: parsed.data.trigger,
    targetNodeId: parsed.data.targetNodeId,
  });
  return NextResponse.json(result);
}
