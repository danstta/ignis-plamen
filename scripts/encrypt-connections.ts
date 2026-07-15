/**
 * One-time bulk migration: seal every plaintext `connections.config` row with
 * CONNECTIONS_ENCRYPTION_KEY. Idempotent — already-sealed rows are skipped, so
 * rerunning is safe. Run with: bun scripts/encrypt-connections.ts
 */
import { config } from "dotenv";

// Next.js loads .env.local automatically, but this is a standalone script,
// so point dotenv at the same file the app uses.
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { connections } from "../lib/db/schema";
import { isSealedConfig, sealConfig } from "../lib/connections/crypto";
import { connectionsEncryptionKey } from "../lib/env";

async function main() {
  if (!connectionsEncryptionKey()) {
    console.error(
      "CONNECTIONS_ENCRYPTION_KEY is not set — nothing to encrypt with. " +
        "Generate a key (see .env.example) and set it in .env.local first.",
    );
    process.exit(1);
  }

  const rows = await db().select().from(connections);
  let sealedNow = 0;
  let alreadySealed = 0;

  for (const row of rows) {
    if (isSealedConfig(row.config)) {
      alreadySealed++;
      continue;
    }
    await db()
      .update(connections)
      .set({ config: sealConfig(row.config ?? {}) })
      .where(eq(connections.id, row.id));
    sealedNow++;
  }

  console.log(
    `Total: ${rows.length} — sealed now: ${sealedNow}, already sealed: ${alreadySealed}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("encrypt-connections failed:", err);
  process.exit(1);
});
