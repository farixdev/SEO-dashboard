import { neon, neonConfig } from "@neondatabase/serverless";
import { type NeonHttpDatabase, drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

type Database = NeonHttpDatabase<typeof schema>;

let instance: Database | null = null;

/**
 * Error codes that mean the request never reached Postgres, so replaying it
 * cannot double-apply a write. Anything else — including a query that failed
 * server-side — is surfaced untouched.
 */
const CONNECT_PHASE_ERRORS = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function isRetryableConnectFailure(error: unknown): boolean {
  let cause: unknown = error;
  // undici nests the real reason a couple of levels down.
  for (let depth = 0; depth < 4 && cause; depth++) {
    const code = (cause as { code?: string }).code;
    if (code && CONNECT_PHASE_ERRORS.has(code)) return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Neon's HTTP driver issues one fetch per query and does not retry. A single
 * dropped connection would otherwise turn into a 500 for the user, which we
 * saw happen under concurrent load. Two quick replays cover the blip without
 * masking a genuine outage.
 */
neonConfig.fetchFunction = async (input: string, init: RequestInit) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectFailure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  throw lastError;
};

function connect(): Database {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Paste your Neon pooled connection string into .env.local, then run `npm run setup`.",
    );
  }

  /**
   * Neon's HTTP driver — one round-trip per query and no pool to leak across
   * serverless invocations. It has no interactive transactions; scripts that
   * need them use `drizzle-orm/neon-serverless` instead (see scripts/db.ts).
   */
  instance = drizzle(neon(connectionString), { schema, casing: "snake_case" });
  return instance;
}

/**
 * Connecting lazily keeps `next build` working without credentials — the error
 * surfaces on the first real query rather than at module load.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(connect(), property, receiver);
  },
});

export { schema };
export * from "./schema";
