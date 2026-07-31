import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../src/db/schema";
// Side-effect import: loads .env.local then .env before anything reads process.env.
import "./load-env";

/**
 * Scripts use the WebSocket driver rather than the app's HTTP one, because
 * seeding and importing want real transactions and multi-statement batches.
 */
neonConfig.webSocketConstructor = ws;

export function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "\n  DATABASE_URL is not set.\n\n" +
        "  1. Create a project at https://console.neon.tech\n" +
        "  2. Copy the *pooled* connection string\n" +
        "  3. Paste it into .env.local as DATABASE_URL=\"…\"\n",
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}

export { schema };
