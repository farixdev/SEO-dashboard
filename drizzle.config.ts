import { defineConfig } from "drizzle-kit";

// Loads .env.local then .env, the way Next.js does.
import { DATABASE_URL } from "./scripts/load-env";

/**
 * `drizzle-kit generate` only reads the schema, so a missing URL is fine there.
 * `push`, `migrate` and `studio` do need it and will fail with drizzle-kit's own
 * message if it is absent.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: DATABASE_URL },
  verbose: true,
  strict: true,
});
