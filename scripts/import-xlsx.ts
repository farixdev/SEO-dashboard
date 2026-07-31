import "./load-env";

import { existsSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

import {
  cleanText,
  monthKey,
  normalizeLinkUrl,
  positionToPage,
  slugify,
  toBool,
  toDateString,
  toInt,
  toNumber,
} from "../src/lib/utils";
import { connect, schema } from "./db";

/* ════════════════════════════════════════════════════════════════
   Imports the original "Mindcob New SEO Dashboard.xlsx" workbook
   (or any workbook with the same sheet layout) into the database.

   Usage:
     npm run db:import -- --file "C:/path/to/workbook.xlsx"
     npm run db:import -- --file "…" --project "Mindcob" --site "https://mindcob.com"
     npm run db:import -- --file "…" --reset      # wipe the project's data first
   ════════════════════════════════════════════════════════════════ */

type Args = {
  file: string;
  project: string;
  site: string;
  country: string;
  reset: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };

  return {
    file: get(
      "file",
      path.join(
        process.env.USERPROFILE ?? process.env.HOME ?? ".",
        "Downloads",
        "Mindcob New SEO Dashboard.xlsx",
      ),
    ),
    project: get("project", "Mindcob"),
    site: get("site", "https://mindcob.com"),
    country: get("country", "Canada"),
    reset: argv.includes("--reset"),
  };
}

/** Sheet → array of rows, each keyed by the sheet's own header text. */
function readSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headerRow = 1,
): Record<string, unknown>[] {
  // Sheet names get truncated to 31 chars by Excel, so match on a prefix.
  const actual =
    workbook.SheetNames.find((s) => s === name) ??
    workbook.SheetNames.find((s) => s.startsWith(name.slice(0, 28)));
  if (!actual) return [];

  const sheet = workbook.Sheets[actual];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRow - 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

/** Reads a cell by A1 reference. */
function cellAt(sheet: XLSX.WorkSheet, address: string): unknown {
  const cell = sheet[address] as XLSX.CellObject | undefined;
  return cell?.v ?? null;
}

function colName(index: number): string {
  // 1 → A, 26 → Z, 27 → AA
  let name = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

const PAGE_TYPES = new Set([
  "Page",
  "Category Page",
  "Service Page",
  "Location Page",
  "Industry Page",
  "Case Study Page",
  "Blog",
  "Landing Page",
]);

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

const INTENTS = new Set([
  "Informational",
  "Transactional",
  "Navigational",
  "Commercial",
  "Listing",
]);

const CHUNK = 300;

async function main() {
  const args = parseArgs();

  if (!existsSync(args.file)) {
    console.error(`\n  Workbook not found:\n    ${args.file}\n`);
    console.error("  Pass the path explicitly:");
    console.error('    npm run db:import -- --file "C:/path/to/workbook.xlsx"\n');
    process.exit(1);
  }

  console.log(`\nReading ${path.basename(args.file)} …`);
  const workbook = XLSX.readFile(args.file, {
    // Raw serials — see excelSerialToDate. `cellDates: true` would build
    // local-midnight Dates and shift every date a day on a non-UTC host.
    cellDates: false,
  });
  console.log(`  sheets: ${workbook.SheetNames.join(", ")}\n`);

  const { db, pool } = connect();

  /* ── Project ────────────────────────────────────────────────── */

  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "ADMIN"))
    .limit(1);

  if (!admin) {
    console.error(
      "  No admin account found. Run `npm run db:seed` first so the project has an owner.\n",
    );
    process.exit(1);
  }

  const slug = slugify(args.project);
  let [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .limit(1);

  if (project) {
    console.log(`  · reusing existing project “${args.project}”`);
  } else {
    [project] = await db
      .insert(schema.projects)
      .values({
        name: args.project,
        slug,
        websiteUrl: args.site,
        clientCompany: args.project,
        country: args.country,
        status: "ACTIVE",
        monthlyBacklinkTarget: 50,
        monthlyKeywordTarget: 5,
        createdById: admin.id,
      })
      .returning({ id: schema.projects.id });

    await db
      .insert(schema.projectMembers)
      .values({ projectId: project.id, userId: admin.id, role: "OWNER" })
      .onConflictDoNothing();

    console.log(`  ✓ created project “${args.project}”`);
  }

  const projectId = project.id;

  if (args.reset) {
    console.log("  · --reset: clearing existing rows for this project");
    await db.delete(schema.rankings).where(eq(schema.rankings.projectId, projectId));
    await db.delete(schema.backlinks).where(eq(schema.backlinks.projectId, projectId));
    await db.delete(schema.keywords).where(eq(schema.keywords.projectId, projectId));
    await db.delete(schema.pages).where(eq(schema.pages.projectId, projectId));
    await db
      .delete(schema.analyticsSnapshots)
      .where(eq(schema.analyticsSnapshots.projectId, projectId));
  }

  /* ── 1. On Page SEO → pages ─────────────────────────────────── */

  const pageRows = readSheet(workbook, "On Page SEO");
  const seenTitles = new Set<string>();
  const pageValues: (typeof schema.pages.$inferInsert)[] = [];
  let duplicateTitles = 0;

  pageRows.forEach((row, index) => {
    const title = cleanText(row["Page Title"]);
    if (!title) return;

    const key = title.toLowerCase();
    if (seenTitles.has(key)) {
      duplicateTitles++;
      return;
    }
    seenTitles.add(key);

    const type = cleanText(row["Type"]) ?? "Page";
    const score = cleanText(row["SEO \nScore"] ?? row["SEO Score"]);

    pageValues.push({
      projectId,
      title,
      targetUrl: cleanText(row["Target URL"]),
      focusKeyword: cleanText(row["Focus Keywords"]),
      type: PAGE_TYPES.has(type) ? type : "Page",
      onPageDone: toBool(row["On Page \nStatus"] ?? row["On Page Status"]),
      seoScore: score,
      indexed: toBool(row["Index"]),
      wordCount: toInt(row["Content\n(Word Count)"] ?? row["Content (Word Count)"]),
      hasFaqs: toBool(row["FAQs"]),
      hasBlogSection: toBool(row["Blog Section"]),
      hasReviewSection: toBool(row["Review \nSection"] ?? row["Review Section"]),
      hasCaseStudySection: toBool(
        row["Case Study\nSection"] ?? row["Case Study Section"],
      ),
      sortOrder: toInt(row["SR NO"]) ?? index + 1,
    });
  });

  for (let i = 0; i < pageValues.length; i += CHUNK) {
    await db
      .insert(schema.pages)
      .values(pageValues.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [schema.pages.projectId, schema.pages.title],
      });
  }
  console.log(
    `  ✓ pages: ${pageValues.length} imported${duplicateTitles ? ` (${duplicateTitles} duplicate titles skipped)` : ""}`,
  );

  // Title → id map for keyword mapping.
  const pageLookup = new Map(
    (
      await db
        .select({ id: schema.pages.id, title: schema.pages.title })
        .from(schema.pages)
        .where(eq(schema.pages.projectId, projectId))
    ).map((p) => [p.title.trim().toLowerCase(), p.id]),
  );

  /* ── 2. Keywords List → keywords ────────────────────────────── */

  // Header sits on row 2 of this sheet, not row 1.
  const keywordRows = readSheet(workbook, "Keywords List", 2);
  const seenKeywords = new Set<string>();
  const keywordValues: (typeof schema.keywords.$inferInsert)[] = [];
  let unmappedPages = 0;
  let duplicateKeywords = 0;

  for (const row of keywordRows) {
    const keyword = cleanText(row["Keywords"]);
    if (!keyword) continue;

    const key = keyword.toLowerCase();
    if (seenKeywords.has(key)) {
      duplicateKeywords++;
      continue;
    }
    seenKeywords.add(key);

    const pageTitle = cleanText(row["Page"]);
    const pageId = pageTitle ? (pageLookup.get(pageTitle.toLowerCase()) ?? null) : null;
    if (pageTitle && !pageId) unmappedPages++;

    const intent = cleanText(row["Intent"]);
    const cpc = toNumber(row["CPC"]);

    keywordValues.push({
      projectId,
      keyword,
      intent: intent && INTENTS.has(intent) ? intent : null,
      // The sheet labelled monthly search volume "Traffic".
      volume: toInt(row["Traffic"]),
      kd: toNumber(row["KD"]),
      cpc: cpc === null ? null : String(cpc),
      competition: toNumber(row["Competition"]),
      ads: toInt(row["Ads"]),
      pageId,
      priority: toBool(row["Priority"]),
      monthlyTarget: toInt(row["Monthly Target"]),
      backlinkTarget: 0,
    });
  }

  for (let i = 0; i < keywordValues.length; i += CHUNK) {
    await db
      .insert(schema.keywords)
      .values(keywordValues.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [schema.keywords.projectId, schema.keywords.keyword],
      });
  }
  console.log(
    `  ✓ keywords: ${keywordValues.length} imported` +
      (duplicateKeywords ? ` (${duplicateKeywords} duplicates skipped)` : "") +
      (unmappedPages ? ` — ${unmappedPages} referenced an unknown page` : ""),
  );

  const keywordLookup = new Map(
    (
      await db
        .select({ id: schema.keywords.id, keyword: schema.keywords.keyword })
        .from(schema.keywords)
        .where(eq(schema.keywords.projectId, projectId))
    ).map((k) => [k.keyword.trim().toLowerCase(), k.id]),
  );

  /* ── 3. Backlinks → backlinks ───────────────────────────────── */

  const staff = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users);
  const staffByName = new Map(staff.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const backlinkRows = readSheet(workbook, "Backlinks");
  /*
   * Two rows can legitimately share a URL: the same site is often used again
   * months later, by a different specialist, with different anchor text. The
   * workbook treats each row as its own record and credits each to its own
   * team member, so the key here has to be the whole row — keying on the URL
   * alone silently deletes real work and under-credits whoever built it.
   */
  const seenRows = new Set<string>();
  const backlinkValues: (typeof schema.backlinks.$inferInsert)[] = [];
  const unmatchedExperts = new Set<string>();
  let duplicateRows = 0;
  let unusableUrls = 0;

  for (const row of backlinkRows) {
    const url = normalizeLinkUrl(cleanText(row["Backlinks"]));
    if (!url) {
      if (cleanText(row["Backlinks"])) unusableUrls++;
      continue;
    }

    const expert = cleanText(row["Expert Name"]);
    const assigneeId = expert ? (staffByName.get(expert.toLowerCase()) ?? null) : null;
    if (expert && !assigneeId) unmatchedExperts.add(expert);

    const type = cleanText(row["Type"]) ?? "Miscellaneous";
    const status = cleanText(row["Status "] ?? row["Status"]) ?? "Published";
    const anchorText1 = cleanText(row["Anchor text 1"]);
    const anchorText2 = cleanText(row["Anchor text 2"]);
    const publishedDate = toDateString(row["Date"] as Date | string | number | null);

    const identity = [url, publishedDate, anchorText1, anchorText2, expert, type]
      .map((part) => String(part ?? "").trim().toLowerCase())
      .join("\u0000");
    if (seenRows.has(identity)) {
      duplicateRows++;
      continue;
    }
    seenRows.add(identity);

    backlinkValues.push({
      projectId,
      url,
      type: BACKLINK_TYPES.has(type) ? type : "Miscellaneous",
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

  /*
   * Every other table here has conflict handling; backlinks had none, so a
   * second run without --reset doubled all 1781 rows and every client-facing
   * total with them. There is no unique constraint to hang ON CONFLICT on —
   * the same URL is legitimately present more than once — so the existing rows
   * are matched on the same whole-row identity used above.
   */
  const alreadyStored = await db
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
    .where(eq(schema.backlinks.projectId, projectId));

  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const known = new Set(
    alreadyStored.map((r) =>
      [
        r.url,
        r.publishedDate,
        r.anchorText1,
        r.anchorText2,
        r.assigneeId ? nameById.get(r.assigneeId) : r.assigneeName,
        r.type,
      ]
        .map((part) => String(part ?? "").trim().toLowerCase())
        .join("\u0000"),
    ),
  );

  const fresh = backlinkValues.filter(
    (v) =>
      !known.has(
        [
          v.url,
          v.publishedDate,
          v.anchorText1,
          v.anchorText2,
          v.assigneeId ? nameById.get(v.assigneeId) : v.assigneeName,
          v.type,
        ]
          .map((part) => String(part ?? "").trim().toLowerCase())
          .join("\u0000"),
      ),
  );
  const alreadyPresent = backlinkValues.length - fresh.length;

  for (let i = 0; i < fresh.length; i += CHUNK) {
    await db.insert(schema.backlinks).values(fresh.slice(i, i + CHUNK));
  }
  console.log(
    `  ✓ backlinks: ${fresh.length} imported` +
      (alreadyPresent ? ` (${alreadyPresent} already in the database)` : "") +
      (duplicateRows ? ` (${duplicateRows} identical rows skipped)` : "") +
      (unusableUrls ? ` (${unusableUrls} rows had no usable URL)` : ""),
  );
  if (unmatchedExperts.size) {
    console.log(
      `      note: no account matched ${[...unmatchedExperts].join(", ")} — stored as text`,
    );
  }

  /* ── 4. Keyword Analysis → rankings ─────────────────────────── */

  const analysisName =
    workbook.SheetNames.find((s) => s === "Keyword Analysis") ?? "Keyword Analysis";
  const analysisSheet = workbook.Sheets[analysisName];
  let rankingCount = 0;
  let unknownKeywords = 0;

  if (analysisSheet) {
    const range = XLSX.utils.decode_range(analysisSheet["!ref"] ?? "A1:A1");

    // Month blocks are triplets starting at column F: (Month, Page, Position).
    const monthColumns: { month: string; pageCol: string; positionCol: string }[] = [];
    for (let col = 6; col <= range.e.c + 1; col += 3) {
      const raw = cellAt(analysisSheet, `${colName(col)}1`);
      if (!raw) continue;
      const month = monthKey(raw as Date | string);
      if (!month) continue;
      monthColumns.push({
        month,
        pageCol: colName(col + 1),
        positionCol: colName(col + 2),
      });
    }

    const rankingValues: (typeof schema.rankings.$inferInsert)[] = [];
    const seenPairs = new Set<string>();

    // Data starts on row 3 (row 1 = dates, row 2 = sub-headers).
    for (let row = 3; row <= range.e.r + 1; row++) {
      const keyword = cleanText(cellAt(analysisSheet, `B${row}`));
      if (!keyword) continue;

      const keywordId = keywordLookup.get(keyword.toLowerCase());
      if (!keywordId) {
        unknownKeywords++;
        continue;
      }

      for (const block of monthColumns) {
        const position = toNumber(cellAt(analysisSheet, `${block.positionCol}${row}`));
        if (position === null || position <= 0) continue;

        const pair = `${keywordId}:${block.month}`;
        if (seenPairs.has(pair)) continue;
        seenPairs.add(pair);

        rankingValues.push({
          projectId,
          keywordId,
          month: block.month,
          position,
          page:
            toNumber(cellAt(analysisSheet, `${block.pageCol}${row}`)) ??
            positionToPage(position) ??
            1,
        });
      }
    }

    for (let i = 0; i < rankingValues.length; i += CHUNK) {
      await db
        .insert(schema.rankings)
        .values(rankingValues.slice(i, i + CHUNK))
        .onConflictDoNothing({
          target: [schema.rankings.keywordId, schema.rankings.month],
        });
    }
    rankingCount = rankingValues.length;

    console.log(
      `  ✓ rankings: ${rankingCount} positions across ${monthColumns.length} months` +
        (unknownKeywords
          ? ` (${unknownKeywords} rows had keywords not in the Keywords List)`
          : ""),
    );
  } else {
    console.log("  · no “Keyword Analysis” sheet found — skipped rankings");
  }

  /* ── 5. Analytics & Search Console → analytics_snapshots ────── */

  const analyticsRows = readSheet(workbook, "Analytics and Search Console Da", 2);
  const analyticsValues: (typeof schema.analyticsSnapshots.$inferInsert)[] = [];
  const seenMonths = new Set<string>();

  for (const row of analyticsRows) {
    const month = monthKey(
      (row["Date"] as Date | string | number | null) ?? (row["Month"] as string | null) ?? "",
    );
    if (!month) continue;

    const country = cleanText(row["Country"]) ?? args.country;
    const dedupeKey = `${month}:${country}`;
    if (seenMonths.has(dedupeKey)) continue;
    seenMonths.add(dedupeKey);

    const keywordRaw = cleanText(row["Keywords"]);
    const hasPlus = keywordRaw ? /\+/.test(keywordRaw) : false;

    analyticsValues.push({
      projectId,
      month,
      capturedOn: toDateString(row["Date"] as Date | string | number | null),
      country,
      clicks: toInt(row["No of Clicks"]) ?? 0,
      impressions: toInt(row["Impressions"]) ?? 0,
      keywordCount: keywordRaw ? toInt(keywordRaw.replace(/\+/g, "")) : null,
      // "1000+" is preserved verbatim so client reports read as they did before.
      keywordCountLabel: hasPlus ? keywordRaw : null,
      gaTraffic: toInt(row["Tracffic"] ?? row["Traffic"]),
    });
  }

  for (let i = 0; i < analyticsValues.length; i += CHUNK) {
    await db
      .insert(schema.analyticsSnapshots)
      .values(analyticsValues.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [
          schema.analyticsSnapshots.projectId,
          schema.analyticsSnapshots.month,
          schema.analyticsSnapshots.country,
        ],
      });
  }
  console.log(`  ✓ search data: ${analyticsValues.length} months imported`);

  /* ── 6. Backfill keyword backlink targets ───────────────────── */

  // The sheet's "Target" column was blank, so derive a sensible starting target
  // from the links already pointing at each keyword (rounded up to a multiple
  // of 5, minimum 5). The team can adjust these in the UI.
  const backfilled = await db.execute(sql`
    update keywords k
    set backlink_target = greatest(5, ceil(counts.total::numeric / 5) * 5)
    from (
      select kk.id,
             count(b.id) as total
      from keywords kk
      left join backlinks b
        on b.project_id = kk.project_id
       and (b.anchor_text_1 = kk.keyword or b.anchor_text_2 = kk.keyword)
      where kk.project_id = ${projectId}
      group by kk.id
      having count(b.id) > 0
    ) as counts
    where k.id = counts.id
      and k.backlink_target = 0
  `);
  console.log(
    `  ✓ set starting backlink targets on ${(backfilled as { rowCount?: number }).rowCount ?? 0} keywords`,
  );

  /* ── Summary ────────────────────────────────────────────────── */

  const [summary] = await db
    .select({
      pages: sql<number>`(select count(*) from pages where project_id = ${projectId})`.mapWith(
        Number,
      ),
      keywords: sql<number>`(select count(*) from keywords where project_id = ${projectId})`.mapWith(
        Number,
      ),
      backlinks: sql<number>`(select count(*) from backlinks where project_id = ${projectId})`.mapWith(
        Number,
      ),
      rankings: sql<number>`(select count(*) from rankings where project_id = ${projectId})`.mapWith(
        Number,
      ),
      analytics: sql<number>`(select count(*) from analytics_snapshots where project_id = ${projectId})`.mapWith(
        Number,
      ),
    })
    .from(sql`(select 1) as t`);

  console.log("\n  In the database now:");
  console.log(`    pages       ${summary.pages}`);
  console.log(`    keywords    ${summary.keywords}`);
  console.log(`    backlinks   ${summary.backlinks}`);
  console.log(`    rankings    ${summary.rankings}`);
  console.log(`    months data ${summary.analytics}`);
  console.log("\n  Open http://localhost:3000/app to see it.\n");

  await pool.end();
}

main().catch((error) => {
  console.error("\nImport failed:", error);
  process.exit(1);
});
