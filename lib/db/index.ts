import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "@/lib/env";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;

/**
 * Cache the client on globalThis so it survives Next.js dev hot-reloads. Without
 * this, every HMR reload of this module resets a plain module-level variable and
 * `db()` opens a fresh postgres client, orphaning the old one. Those orphans keep
 * their pooler connections open until idle_timeout, pile up across a navigation
 * session, and eventually exhaust the Supabase transaction pooler's connection
 * limit — at which point new connects block for seconds-to-minutes. (No effect in
 * production, where modules are evaluated once.)
 */
const globalForDb = globalThis as unknown as {
  _db?: Db;
  _client?: Client;
};

/**
 * Lazily-created Drizzle client (singleton). `prepare: false` keeps it compatible
 * with serverless connection poolers like Supabase's transaction pooler.
 */
export function db(): Db {
  if (globalForDb._db) return globalForDb._db;
  globalForDb._client = postgres(databaseUrl(), {
    // prepare:false is required by the Supabase transaction pooler (port 6543).
    prepare: false,
    // A small pool (not max:1). The pooler and intervening NAT silently drop idle
    // TCP sockets, and Windows' default keepalive is ~2h, so Node keeps handing out
    // half-open connections. With max:1 a single dead socket blocks every query for
    // minutes (OS TCP timeout) with no spare to fall back on; a few spares mean a
    // dead connection only stalls its own query, and concurrent layout+page queries
    // run in parallel instead of serializing.
    max: 5,
    // Recycle connections well before the pooler/NAT idle-drop window so they never
    // go half-open in the first place.
    max_lifetime: 60 * 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalForDb._db = drizzle(globalForDb._client, { schema });
  return globalForDb._db;
}

export { schema };
