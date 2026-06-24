"use server";

import { revalidatePath } from "next/cache";
import { setPluginEnabled } from "@/lib/plugins/service";

export async function setPluginEnabledAction(id: string, enabled: boolean) {
  await setPluginEnabled(id, enabled);
  revalidatePath("/plugins");
}
