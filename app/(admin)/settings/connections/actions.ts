"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createConnection,
  deleteConnection,
  getConnection,
  updateConnection,
} from "@/lib/connections/service";
import { getConnectionType } from "@/lib/connections/registry";

/** Create a key-based account, then open its detail page to enter credentials. */
export async function createConnectionAction(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const def = getConnectionType(type);
  if (!def) throw new Error(`Unknown connection type: ${type}`);
  if (def.auth.type !== "keys") {
    throw new Error(`${def.name} connects via OAuth, not a form`);
  }
  const name = String(formData.get("name") || def.name);
  const conn = await createConnection({ type, name });
  redirect(`/settings/connections/${conn.id}`);
}

/** Save the name and (for key-based providers) credential fields. */
export async function updateConnectionConfigAction(
  id: string,
  formData: FormData,
) {
  const conn = await getConnection(id);
  if (!conn) throw new Error("Connection not found");
  const def = getConnectionType(conn.type);
  if (!def) throw new Error(`Unknown connection type: ${conn.type}`);

  const fields = def.auth.type === "keys" ? def.auth.fields : [];
  const patch: Record<string, unknown> = {};
  for (const f of fields) {
    const v = formData.get(f.name);
    if (v !== null) patch[f.name] = String(v);
  }
  const name = String(formData.get("name") || conn.name);

  // Preserve existing config (e.g. OAuth tokens) while applying edits.
  await updateConnection(id, {
    name,
    config: { ...(conn.config ?? {}), ...patch },
  });
  revalidatePath(`/settings/connections/${id}`);
}

export async function deleteConnectionAction(id: string) {
  await deleteConnection(id);
  redirect("/settings/connections");
}
