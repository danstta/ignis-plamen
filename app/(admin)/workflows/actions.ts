"use server";

import { revalidatePath } from "next/cache";
import { deleteWorkflow } from "@/lib/workflows/service";

export async function deleteWorkflowAction(id: string) {
  await deleteWorkflow(id);
  revalidatePath("/workflows");
}
