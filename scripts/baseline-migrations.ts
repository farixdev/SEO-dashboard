import "./load-env";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { connect } from "./db";

/* ════════════════════════════════════════════════════════════════
   Marks migrations as already applied, without running them.

   This database was built with `db:push` during development, so the
   schema is correct but `__drizzle_migrations` is empty. Running
   `db:migrate` against it would try to CREATE TABLE over tables that
   already exist and fail on the first statement.

   A fresh database does not need this — `db:migrate` handles it. This
   is only for bringing an already-pushed database into the migration
   history, once.

   It refuses to run if the schema does NOT already match, so it can
   never be used to skip a migration that genuinely needs applying.

   Usage:
     npm run db:baseline            # report what it would record
     npm run db:baseline -- --apply
   ════════════════════════════════════════════════════════════════ */

type JournalEntry = { idx: number; when: number; tag: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, pool } = connect();

  const journal = JSON.parse(
    readFileSync("./drizzle/meta/_journal.json", "utf8"),
  ) as { entries: JournalEntry[] };

  // The whole point of a baseline is that the schema is already there. If a
  // late column is missing, this is the wrong tool — say so rather than
  // recording a lie that hides a real migration forever.
  const [check] = await db.execute(sql`
    select
      (select count(*) from information_schema.columns
        where table_name = 'users' and column_name = 'invite_token_hash')::int as invite_col,
      (select count(*) from pg_indexes
        where indexname = 'backlinks_anchor1_lower_idx')::int as anchor_idx,
      (select count(*) from information_schema.tables
        where table_name = 'backlinks')::int as core_table
  `).then((r) => (r as unknown as { rows?: Record<string, number>[] }).rows ??
    (r as unknown as Record<string, number>[]));

  const ready = check.core_table > 0 && check.invite_col > 0 && check.anchor_idx > 0;
  console.log(`\n  core tables present   ${check.core_table > 0 ? "yes" : "NO"}`);
  console.log(`  invite columns        ${check.invite_col > 0 ? "yes" : "NO"}`);
  console.log(`  anchor expression idx ${check.anchor_idx > 0 ? "yes" : "NO"}`);

  if (!ready) {
    console.error(
      "\n  The schema does not match the migrations yet, so there is nothing to\n" +
        "  baseline. Run `npm run db:migrate` instead.\n",
    );
    await pool.end();
    process.exit(1);
  }

  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(sql`
    create table if not exists drizzle."__drizzle_migrations" (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);

  const existing = await db
    .execute(sql`select hash from drizzle."__drizzle_migrations"`)
    .then((r) => (r as unknown as { rows?: { hash: string }[] }).rows ??
      (r as unknown as { hash: string }[]));
  const known = new Set(existing.map((e) => e.hash));

  const pending = journal.entries
    .map((entry) => ({
      tag: entry.tag,
      when: entry.when,
      hash: createHash("sha256")
        .update(readFileSync(`./drizzle/${entry.tag}.sql`, "utf8"))
        .digest("hex"),
    }))
    .filter((m) => !known.has(m.hash));

  console.log(`\n  already recorded      ${known.size}`);
  console.log(`  to record             ${pending.length}`);
  for (const m of pending) console.log(`    · ${m.tag}  ${m.hash.slice(0, 12)}…`);

  if (!pending.length) {
    console.log("\n  Nothing to do — the history already matches.\n");
  } else if (!apply) {
    console.log("\n  Dry run. Re-run with --apply to record these.\n");
  } else {
    for (const m of pending) {
      await db.execute(sql`
        insert into drizzle."__drizzle_migrations" (hash, created_at)
        values (${m.hash}, ${m.when})
      `);
    }
    console.log(`\n  ✓ recorded ${pending.length} migration(s) as applied.\n`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error("Baseline failed:", error);
  process.exit(1);
});
