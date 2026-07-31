import { existsSync } from "node:fs";

import dotenv from "dotenv";

/**
 * Next.js loads `.env.local` automatically; drizzle-kit and plain `tsx` scripts
 * do not. Load the same files Next would, in the same precedence order:
 * `.env.local` wins over `.env`, and neither overrides a real process env var.
 */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) dotenv.config({ path: file, override: false, quiet: true });
}

export const DATABASE_URL = process.env.DATABASE_URL ?? "";
