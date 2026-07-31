import "./load-env";

import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { connect } from "./db";

/** Applies the SQL files in ./drizzle. Use `npm run db:push` for quick dev sync. */
async function main() {
  const { db, pool } = connect();
  console.log("Applying migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
