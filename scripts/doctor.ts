import "./load-env";

import { existsSync } from "node:fs";

import { sql } from "drizzle-orm";

import { connect } from "./db";

/* ════════════════════════════════════════════════════════════════
   Environment check.

   Prints a readable status report and signals what is still needed
   through the exit code, so start.bat can decide what to run without
   parsing text.

     0  ready — schema and data present
     2  schema present, project data empty     → needs an import
     3  database reachable, schema missing     → needs push + seed
     4  DATABASE_URL missing or blank          → needs configuring
     5  database unreachable                   → bad string or asleep
   ════════════════════════════════════════════════════════════════ */

const EXIT = {
  ready: 0,
  needsImport: 2,
  needsSchema: 3,
  needsUrl: 4,
  unreachable: 5,
} as const;

const tick = (ok: boolean) => (ok ? "  [ OK ]" : "  [ !! ]");

function line(ok: boolean, label: string, detail = "") {
  console.log(`${tick(ok)} ${label.padEnd(30)} ${detail}`);
}

async function main() {
  console.log("\n  SEO Dashboard — environment check");
  console.log("  " + "-".repeat(62));

  /* ── Node ── */
  const major = Number(process.versions.node.split(".")[0]);
  line(major >= 20, "Node.js", `v${process.versions.node}${major >= 20 ? "" : "  (needs v20 or newer)"}`);
  if (major < 20) process.exit(EXIT.needsUrl);

  /* ── Files ── */
  line(existsSync("node_modules"), "Dependencies", existsSync("node_modules") ? "installed" : "run npm install");
  line(existsSync(".env.local"), "Config file", ".env.local");

  /* ── Secrets ── */
  const url = process.env.DATABASE_URL ?? "";
  const secret = process.env.AUTH_SECRET ?? "";

  if (!url.trim()) {
    line(false, "DATABASE_URL", "not set");
    console.log(
      "\n  Paste your Neon connection string into .env.local:\n" +
        '    DATABASE_URL="postgresql://...?sslmode=require"\n' +
        "\n  Get it from https://console.neon.tech -> your project -> Connect\n" +
        "  (choose the pooled connection string)\n",
    );
    process.exit(EXIT.needsUrl);
  }

  // Show the host only — never echo the password to a terminal.
  let host = "unknown host";
  try {
    host = new URL(url).host;
  } catch {
    /* keep the placeholder */
  }
  line(true, "DATABASE_URL", host);
  line(
    secret.length >= 24,
    "AUTH_SECRET",
    secret.length >= 24 ? `${secret.length} characters` : "too short — set 32+ random characters",
  );

  /* ── Database ── */
  const { db, pool } = connect();
  let version = "";
  try {
    const started = Date.now();
    const res = await db.execute(sql`select version() as v`);
    const rows = (res as unknown as { rows?: { v: string }[] }).rows ??
      (res as unknown as { v: string }[]);
    version = String(rows[0]?.v ?? "").split(",")[0];
    line(true, "Database connection", `${version}  (${Date.now() - started}ms)`);
  } catch (error) {
    line(false, "Database connection", error instanceof Error ? error.message : "failed");
    console.log(
      "\n  The connection string was rejected. Check that it is the pooled\n" +
        "  string, that it still ends with ?sslmode=require, and that the\n" +
        "  Neon project is not suspended.\n",
    );
    await pool.end();
    process.exit(EXIT.unreachable);
  }

  /* ── Schema ── */
  const tablesRes = await db.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public'`);
  const tableRows =
    (tablesRes as unknown as { rows?: { table_name: string }[] }).rows ??
    (tablesRes as unknown as { table_name: string }[]);
  const tables = new Set(tableRows.map((r) => r.table_name));

  const REQUIRED = [
    "users",
    "projects",
    "project_members",
    "pages",
    "keywords",
    "backlinks",
    "rankings",
    "analytics_snapshots",
    "tasks",
    "threads",
    "messages",
    "thread_reads",
    "activity_log",
  ];
  const missing = REQUIRED.filter((t) => !tables.has(t));

  if (missing.length) {
    line(false, "Schema", `${REQUIRED.length - missing.length}/${REQUIRED.length} tables — run setup`);
    await pool.end();
    process.exit(EXIT.needsSchema);
  }
  line(true, "Schema", `${REQUIRED.length} tables`);

  /* ── Data ── */
  const countsRes = await db.execute(sql`
    select
      (select count(*) from users)::int      as users,
      (select count(*) from projects)::int   as projects,
      (select count(*) from pages)::int      as pages,
      (select count(*) from keywords)::int   as keywords,
      (select count(*) from backlinks)::int  as backlinks,
      (select count(*) from rankings)::int   as rankings,
      (select count(*) from analytics_snapshots)::int as analytics`);
  const counts =
    ((countsRes as unknown as { rows?: Record<string, number>[] }).rows ??
      (countsRes as unknown as Record<string, number>[]))[0];

  line(counts.users > 0, "Accounts", `${counts.users} user${counts.users === 1 ? "" : "s"}`);
  line(counts.projects > 0, "Projects", `${counts.projects}`);

  console.log("  " + "-".repeat(62));
  console.log(
    `        pages ${String(counts.pages).padStart(6)}` +
      `   keywords ${String(counts.keywords).padStart(6)}` +
      `   backlinks ${String(counts.backlinks).padStart(6)}`,
  );
  console.log(
    `     rankings ${String(counts.rankings).padStart(6)}` +
      `   months   ${String(counts.analytics).padStart(6)}`,
  );
  console.log("  " + "-".repeat(62));

  await pool.end();

  if (counts.users === 0) {
    console.log("\n  No accounts yet — run setup to create the admin login.\n");
    process.exit(EXIT.needsSchema);
  }
  if (counts.projects === 0 || counts.backlinks === 0) {
    console.log("\n  No project data yet — import your workbook to load it.\n");
    process.exit(EXIT.needsImport);
  }

  console.log("\n  Everything is ready.\n");
  process.exit(EXIT.ready);
}

main().catch((error) => {
  console.error("\n  Check failed:", error instanceof Error ? error.message : error);
  process.exit(EXIT.unreachable);
});
