import "./load-env";

import { existsSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";

import {
  cleanText,
  normalizeLinkUrl,
  toBool,
  toDateString,
  toNumber,
} from "../src/lib/utils";
import { connect, schema } from "./db";

/* ════════════════════════════════════════════════════════════════
   Adds backlink rows from the workbook that are not in the database
   yet, without touching anything already there.

   `npm run db:import -- --reset` is the other way to reconcile, but it
   deletes the project's rows first — which throws away anything the team
   has edited in the app since the last import. This is the safe path:
   additive, idempotent, and runnable whenever the client sends an updated
   sheet.

   Usage:
     npm run db:sync                    # dry run — shows what it would add
     npm run db:sync -- --apply         # actually insert
     npm run db:sync -- --file "…"      # a different workbook
   ════════════════════════════════════════════════════════════════ */

const BACKLINK_TYPES = new Set([
  "Guest Posts",
  "Profile Build Links",
  "Local Citation",
  "Article Submission",
  "Miscellaneous",
  "Ads Posting",
  "Web 2.0",
  "Social Bookmarking",
  "Forum Posting",
  "Image Sharing",
  "Video Submission",
  "PDF Submission",
]);

/**
 * What makes two rows the same piece of work. The URL alone is not enough —
 * the same site is often used again months later by a different specialist
 * with different anchor text, and each of those is its own record.
 */
function identityOf(parts: (string | null | undefined)[]): string {
  return parts.map((p) => String(p ?? "").trim().toLowerCase()).join("\u0000");
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const fileIndex = argv.indexOf("--file");
  const file =
    fileIndex >= 0 && argv[fileIndex + 1]
      ? argv[fileIndex + 1]
      : path.join(
          process.env.USERPROFILE ?? process.env.HOME ?? ".",
          "Downloads",
          "Mindcob New SEO Dashboard.xlsx",
        );

  if (!existsSync(file)) {
    console.error(`\n  Workbook not found:\n    ${file}\n`);
    process.exit(1);
  }

  const { db, pool } = connect();

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .limit(1);

  if (!project) {
    console.error("  No project found. Run `npm run db:import` first.\n");
    process.exit(1);
  }

  const workbook = XLSX.readFile(file, {
    // Raw serials — see excelSerialToDate. `cellDates: true` would build
    // local-midnight Dates and shift every date a day on a non-UTC host.
    cellDates: false,
  });
  const sheetName =
    workbook.SheetNames.find((s) => s === "Backlinks") ??
    workbook.SheetNames.find((s) => s.startsWith("Backlink"));
  if (!sheetName) {
    console.error("  The workbook has no Backlinks sheet.\n");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: null, raw: true, blankrows: false },
  );

  const staff = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users);
  const staffByName = new Map(staff.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const staffById = new Map(staff.map((s) => [s.id, s.name]));

  const existing = await db
    .select({
      url: schema.backlinks.url,
      publishedDate: schema.backlinks.publishedDate,
      anchorText1: schema.backlinks.anchorText1,
      anchorText2: schema.backlinks.anchorText2,
      assigneeId: schema.backlinks.assigneeId,
      assigneeName: schema.backlinks.assigneeName,
      type: schema.backlinks.type,
    })
    .from(schema.backlinks)
    .where(eq(schema.backlinks.projectId, project.id));

  const known = new Set(
    existing.map((r) =>
      identityOf([
        r.url,
        r.publishedDate,
        r.anchorText1,
        r.anchorText2,
        r.assigneeId ? staffById.get(r.assigneeId) : r.assigneeName,
        r.type,
      ]),
    ),
  );

  const toInsert: (typeof schema.backlinks.$inferInsert)[] = [];
  const seen = new Set<string>();
  let unusable = 0;

  for (const row of rows) {
    const url = normalizeLinkUrl(cleanText(row["Backlinks"]));
    if (!url) {
      if (cleanText(row["Backlinks"])) unusable++;
      continue;
    }

    const expert = cleanText(row["Expert Name"]);
    const assigneeId = expert ? (staffByName.get(expert.toLowerCase()) ?? null) : null;
    const rawType = cleanText(row["Type"]) ?? "Miscellaneous";
    const status = cleanText(row["Status "] ?? row["Status"]) ?? "Published";
    const anchorText1 = cleanText(row["Anchor text 1"]);
    const anchorText2 = cleanText(row["Anchor text 2"]);
    const publishedDate = toDateString(row["Date"] as Date | string | number | null);
    const type = BACKLINK_TYPES.has(rawType) ? rawType : "Miscellaneous";

    const identity = identityOf([
      url,
      publishedDate,
      anchorText1,
      anchorText2,
      expert,
      type,
    ]);
    if (seen.has(identity) || known.has(identity)) continue;
    seen.add(identity);

    toInsert.push({
      projectId: project.id,
      url,
      type,
      status: ["Published", "Pending", "Wrong", "Removed"].includes(status)
        ? status
        : "Published",
      indexed: toBool(row["Index (Y/N)"]),
      anchorText1,
      anchorText2,
      publishedDate,
      assigneeId,
      assigneeName: assigneeId ? null : expert,
      da: toNumber(row["DA"]),
      pa: toNumber(row["PA"]),
      spamScore: toNumber(row["Spam Score"]),
      loginUser: cleanText(row["User"]),
      loginPassword: cleanText(row["Password"]),
    });
  }

  console.log(`\n  Project        ${project.name}`);
  console.log(`  Workbook       ${path.basename(file)}`);
  console.log(`  Sheet rows     ${rows.filter((r) => cleanText(r["Backlinks"])).length}`);
  console.log(`  Already stored ${existing.length}`);
  if (unusable) console.log(`  Unusable URLs  ${unusable}`);
  console.log(`  Missing        ${toInsert.length}`);

  if (toInsert.length) {
    console.log("");
    for (const r of toInsert.slice(0, 20)) {
      const who = r.assigneeId ? staffById.get(r.assigneeId) : r.assigneeName;
      console.log(
        `    + ${String(r.url).slice(0, 58).padEnd(60)} ${r.publishedDate ?? "—"}  ${who ?? "—"}`,
      );
    }
    if (toInsert.length > 20) console.log(`    … and ${toInsert.length - 20} more`);
  }

  if (!toInsert.length) {
    console.log("\n  Nothing to add — the database already matches the workbook.\n");
  } else if (!apply) {
    console.log("\n  Dry run. Re-run with --apply to insert these rows.\n");
  } else {
    for (let i = 0; i < toInsert.length; i += 300) {
      await db.insert(schema.backlinks).values(toInsert.slice(i, i + 300));
    }
    console.log(`\n  ✓ inserted ${toInsert.length} backlink${toInsert.length === 1 ? "" : "s"}.\n`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
