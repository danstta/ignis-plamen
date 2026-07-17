/**
 * One-time bulk reverse migration: open every sealed `connections.config` row
 * back to plaintext, for operators turning connection encryption off. Idempotent
 * — plaintext rows are skipped, so rerunning is safe. Requires the key the rows
 * were sealed with. Run with: bun scripts/decrypt-connections.ts
 * Afterwards, remove CONNECTIONS_ENCRYPTION_KEY from the environment everywhere
 * the app runs (.env.local, deployment env) so new rows are stored plaintext too.
 */
import { config } from "dotenv";

// Next.js loads .env.local automatically, but this is a standalone script,
// so point dotenv at the same file the app uses.
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { connections } from "../lib/db/schema";
import { isSealedConfig, openConfig } from "../lib/connections/crypto";
import { connectionsEncryptionKey } from "../lib/env";

async function main() {
  if (!connectionsEncryptionKey()) {
    console.error(
      "CONNECTIONS_ENCRYPTION_KEY is not set — sealed rows cannot be opened " +
        "without it. Set the key the rows were sealed with, then rerun.",
    );
    process.exit(1);
  }

  const rows = await db().select().from(connections);

  // Preflight: decrypt everything in memory before any writes, so a wrong key
  // can never leave the dataset half-migrated.
  const opened: { id: (typeof rows)[number]["id"]; config: Record<string, unknown> }[] = [];
  let alreadyPlaintext = 0;
  for (const row of rows) {
    if (!isSealedConfig(row.config)) {
      alreadyPlaintext++;
      continue;
    }
    try {
      opened.push({ id: row.id, config: openConfig(row.config) });
    } catch (err) {
      console.error(
        `Connection ${row.id} cannot be opened with the active key — refusing ` +
          "to write anything. Fix CONNECTIONS_ENCRYPTION_KEY first.",
        err,
      );
      process.exit(1);
    }
  }

  for (const row of opened) {
    await db()
      .update(connections)
      .set({ config: row.config })
      .where(eq(connections.id, row.id));
  }

  console.log(
    `Total: ${rows.length} — decrypted now: ${opened.length}, already plaintext: ${alreadyPlaintext}`,
  );
  console.log(
    "Done. Now remove CONNECTIONS_ENCRYPTION_KEY from .env.local and any " +
      "deployment environment, then restart the app.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("decrypt-connections failed:", err);
  process.exit(1);
});
