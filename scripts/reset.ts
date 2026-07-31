import "./load-env";

import { sql } from "drizzle-orm";

import { connect } from "./db";

/**
 * Drops every table so `db:push` can rebuild from scratch. Destructive —
 * requires --yes so it cannot run by accident.
 */
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "\n  This deletes every table and all data in the database.\n" +
        "  Re-run with --yes if that is what you want:\n\n" +
        "    npm run db:reset -- --yes\n",
    );
    process.exit(1);
  }

  const { db, pool } = connect();

  console.log("\nDropping all tables in the public schema …");
  await db.execute(sql`
    do $$
    declare
      stmt text;
    begin
      select 'drop table if exists ' ||
             string_agg(format('%I.%I', schemaname, tablename), ', ') ||
             ' cascade'
        into stmt
        from pg_tables
       where schemaname = 'public';

      if stmt is not null then
        execute stmt;
      end if;
    end $$;
  `);

  console.log("Done. Run `npm run db:push` to recreate the schema.\n");
  await pool.end();
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
