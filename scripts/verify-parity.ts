import "./load-env";
// The query modules under test import "server-only", a specifier Next aliases
// at build time and Node cannot resolve. Point at a local no-op so this script
// can exercise the app's real queries rather than a re-implementation of them.
import "./register-server-only-shim";

import { existsSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

import {
  cleanText,
  monthKey,
  monthLabel,
  normalizeLinkUrl,
  toBool,
  toDateString,
  toInt,
  toNumber,
} from "../src/lib/utils";
import { connect, schema } from "./db";

/* ════════════════════════════════════════════════════════════════
   Parity check: workbook vs database.

   Reads the workbook, recomputes the sheet's own formulas in plain
   TypeScript, then runs the equivalent SQL and compares. Anything that
   disagrees is printed with both values.

   This is deliberately independent of the import script — it recomputes
   from the raw cells rather than trusting the importer.

   Usage: npm run db:parity -- --file "C:/path/to/workbook.xlsx"
   ════════════════════════════════════════════════════════════════ */

function arg(flag: string, fallback: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${flag}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const FILE = arg(
  "file",
  path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? ".",
    "Downloads",
    "Mindcob New SEO Dashboard.xlsx",
  ),
);
const PROJECT = arg("project", "Mindcob");

if (!existsSync(FILE)) {
  console.error(`\n  Workbook not found:\n    ${FILE}\n`);
  process.exit(1);
}

function readSheet(wb: XLSX.WorkBook, name: string, headerRow = 1) {
  const actual =
    wb.SheetNames.find((s) => s === name) ??
    wb.SheetNames.find((s) => s.startsWith(name.slice(0, 28)));
  if (!actual) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[actual], {
    range: headerRow - 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function colName(index: number): string {
  let name = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

const cellAt = (sheet: XLSX.WorkSheet, a: string) =>
  (sheet[a] as XLSX.CellObject | undefined)?.v ?? null;

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** "Sep-25" — the sheet's own month label — into the app's "2025-09-01" key. */
function monthKeyFromLabel(label: string): string | null {
  const m = /^([A-Za-z]{3})[- ]?(\d{2,4})$/.exec(label.trim());
  if (!m) return null;
  const month = MONTH_ABBR.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/* ── Reporting ─────────────────────────────────────────────────── */

let checks = 0;
let failures = 0;
const details: string[] = [];

function check(label: string, sheetValue: unknown, dbValue: unknown) {
  checks++;
  const a = sheetValue === null || sheetValue === undefined ? "—" : String(sheetValue);
  const b = dbValue === null || dbValue === undefined ? "—" : String(dbValue);
  const ok = a === b;
  if (!ok) {
    failures++;
    if (details.length < 40) details.push(`   ${label}\n      sheet=${a}  db=${b}`);
  }
  return ok;
}

function section(title: string) {
  console.log(`\n${title}`);
  console.log("─".repeat(Math.max(title.length, 60)));
}

function report(label: string, sheetValue: unknown, dbValue: unknown) {
  const ok = check(label, sheetValue, dbValue);
  const a = String(sheetValue ?? "—");
  const b = String(dbValue ?? "—");
  console.log(
    `  ${ok ? "✓" : "✗"} ${label.padEnd(46)} sheet=${a.padStart(9)}  db=${b.padStart(9)}`,
  );
}

async function main() {
  const wb = XLSX.readFile(FILE, {
    // Raw serials — see excelSerialToDate. `cellDates: true` would build
    // local-midnight Dates and shift every date a day on a non-UTC host.
    cellDates: false,
  });
  const { db, pool } = connect();

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.name, PROJECT))
    .limit(1);

  if (!project) {
    console.error(`\n  No project named "${PROJECT}" in the database.\n`);
    process.exit(1);
  }

  console.log(`\nWorkbook : ${path.basename(FILE)}`);
  console.log(`Project  : ${project.name}`);

  /* ── Load the workbook into plain structures ──────────────────── */

  const pageRows = readSheet(wb, "On Page SEO");
  const keywordRows = readSheet(wb, "Keywords List", 2);
  const backlinkRows = readSheet(wb, "Backlinks");
  const analyticsRows = readSheet(wb, "Analytics and Search Console Da", 2);

  type Link = {
    url: string;
    type: string;
    status: string;
    indexed: boolean;
    a1: string | null;
    a2: string | null;
    date: string | null;
    month: string | null;
    expert: string | null;
    da: number | null;
    spam: number | null;
  };

  /*
   * This deliberately does NOT reuse the importer's filters. Reading the sheet
   * the same way the importer does would make every check self-confirming — it
   * would compare the importer's interpretation against the importer's output
   * and agree by construction, no matter how many rows were dropped on the way
   * in. The only shared step is URL normalisation, which is a property of the
   * sheet's data entry, not a decision about what to keep.
   */
  const links: Link[] = [];
  const seenRow = new Set<string>();
  let unusable = 0;
  for (const row of backlinkRows) {
    const url = normalizeLinkUrl(cleanText(row["Backlinks"]));
    if (!url) {
      if (cleanText(row["Backlinks"])) unusable++;
      continue;
    }
    const date = toDateString(row["Date"] as Date | string | number | null);
    // Only a byte-identical repeat is a duplicate; same URL, different work is not.
    const identity = [
      url,
      date,
      cleanText(row["Anchor text 1"]),
      cleanText(row["Anchor text 2"]),
      cleanText(row["Expert Name"]),
      cleanText(row["Type"]) ?? "Miscellaneous",
    ]
      .map((part) => String(part ?? "").trim().toLowerCase())
      .join("\u0000");
    if (seenRow.has(identity)) continue;
    seenRow.add(identity);
    links.push({
      url,
      type: cleanText(row["Type"]) ?? "Miscellaneous",
      status: cleanText(row["Status "] ?? row["Status"]) ?? "Published",
      indexed: toBool(row["Index (Y/N)"]),
      a1: cleanText(row["Anchor text 1"]),
      a2: cleanText(row["Anchor text 2"]),
      date,
      month: date ? monthKey(date) : null,
      expert: cleanText(row["Expert Name"]),
      da: toNumber(row["DA"]),
      spam: toNumber(row["Spam Score"]),
    });
  }

  const keywords = new Map<string, { intent: string | null; volume: number | null }>();
  for (const row of keywordRows) {
    const k = cleanText(row["Keywords"]);
    if (!k || keywords.has(k.toLowerCase())) continue;
    keywords.set(k.toLowerCase(), {
      intent: cleanText(row["Intent"]),
      volume: toInt(row["Traffic"]),
    });
  }

  const pages = new Map<string, Record<string, unknown>>();
  for (const row of pageRows) {
    const t = cleanText(row["Page Title"]);
    if (!t || pages.has(t.toLowerCase())) continue;
    pages.set(t.toLowerCase(), row);
  }

  /* ── 1. Row counts ────────────────────────────────────────────── */

  section("1. Row counts");

  // Worth saying out loud rather than silently dropping: a row whose link cell
  // is filled in but unusable is data the client typed and the app does not have.
  if (unusable) {
    console.log(
      `  · ${unusable} sheet row${unusable === 1 ? "" : "s"} had a link value that is not a usable URL`,
    );
  }

  const counts = await db.execute(
     
    (await import("drizzle-orm")).sql`
      select
        (select count(*) from pages     where project_id = ${project.id})::int as pages,
        (select count(*) from keywords  where project_id = ${project.id})::int as keywords,
        (select count(*) from backlinks where project_id = ${project.id})::int as backlinks,
        (select count(*) from rankings  where project_id = ${project.id})::int as rankings,
        (select count(*) from analytics_snapshots where project_id = ${project.id})::int as analytics`,
  );
  const c = (counts as unknown as { rows?: Record<string, number>[] }).rows?.[0] ??
    (counts as unknown as Record<string, number>[])[0];

  report("pages", pages.size, c.pages);
  report("keywords", keywords.size, c.keywords);
  report("backlinks", links.length, c.backlinks);

  /* ── 2. Dashboard: links by type  (sheet B3:B13) ──────────────── */

  section("2. Dashboard — links by type   (COUNTIF Backlinks!B)");

  const byType = new Map<string, number>();
  for (const l of links) byType.set(l.type, (byType.get(l.type) ?? 0) + 1);

  const { getBacklinksByType } = await import("../src/db/queries/dashboard");
  const dbByType = new Map(
    (await getBacklinksByType(project.id)).map((r) => [r.label, r.value]),
  );
  for (const [type, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    report(type, n, dbByType.get(type) ?? 0);
  }
  report("TOTAL", links.length, [...dbByType.values()].reduce((a, b) => a + b, 0));

  /* ── 3. Dashboard: links per month  (sheet E3:E28) ────────────── */

  section("3. Dashboard — links per month   (COUNTIF Backlinks!I)");

  /*
   * Counted from the sheet's OWN Month column (`I = TEXT(G,"MMM-YY")`), not
   * from a month we recompute off the same date we imported. Recomputing made
   * this check self-confirming: a timezone bug that shifted every imported
   * date back a day shifted our recomputed month with it, so both sides agreed
   * while five links sat in the wrong month on the client's dashboard.
   */
  const byMonth = new Map<string, number>();
  for (const row of backlinkRows) {
    if (!normalizeLinkUrl(cleanText(row["Backlinks"]))) continue;
    const own = cleanText(row["Month"]);
    if (!own) continue;
    const key = monthKeyFromLabel(own);
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  const { getBacklinksByMonth } = await import("../src/db/queries/dashboard");
  const dbByMonth = new Map(
    (await getBacklinksByMonth(project.id)).map((r) => [r.month, r.value]),
  );
  for (const m of [...byMonth.keys()].sort()) {
    report(monthLabel(m), byMonth.get(m), dbByMonth.get(m) ?? 0);
  }

  /* ── 4. Keyword link counts  (sheet Keywords List N / O) ──────── */

  section("4. Keyword link counts   (COUNTIFS on anchor text)");

  /*
   * Sheet N: indexed links whose anchor 1 OR 2 equals the keyword.
   * Sheet O: published links, same anchor rule.
   *
   * Two deliberate differences from the workbook:
   *
   *  1. Excel's COUNTIFS ignores case and surrounding spaces. Matched the same
   *     way here — the workbook depends on it ("SEO Services in Canada" is
   *     meant to count towards "seo services in canada").
   *
   *  2. The sheet computes SUM(COUNTIFS(anchor1=kw), COUNTIFS(anchor2=kw)),
   *     so a link carrying the same keyword in BOTH anchor slots is counted
   *     twice. One backlink is one link, so it is counted once here. The
   *     divergence is reported rather than hidden.
   */
  const norm = (s: string) => s.trim().toLowerCase();
  const indexedByKw = new Map<string, number>();
  const publishedByKw = new Map<string, number>();
  const doubleCounted = new Map<string, number>();

  for (const l of links) {
    const anchors = [l.a1, l.a2]
      .filter((a): a is string => Boolean(a))
      .map(norm)
      .filter((a) => keywords.has(a));

    if (anchors.length === 2 && anchors[0] === anchors[1]) {
      doubleCounted.set(anchors[0], (doubleCounted.get(anchors[0]) ?? 0) + 1);
    }

    // One link contributes at most once per keyword.
    for (const key of new Set(anchors)) {
      if (l.indexed) indexedByKw.set(key, (indexedByKw.get(key) ?? 0) + 1);
      if (l.status === "Published")
        publishedByKw.set(key, (publishedByKw.get(key) ?? 0) + 1);
    }
  }

  const { attachKeywordMetrics } = await import("../src/db/queries/keywords");
  const topKeywords = [...publishedByKw.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);

  const dbKeywordRows = await db
    .select({
      id: schema.keywords.id,
      keyword: schema.keywords.keyword,
      backlinkTarget: schema.keywords.backlinkTarget,
    })
    .from(schema.keywords)
    .where(eq(schema.keywords.projectId, project.id));

  const wanted = dbKeywordRows.filter((r) =>
    topKeywords.includes(r.keyword.toLowerCase()),
  );
  const enriched = await attachKeywordMetrics(project.id, wanted, monthKey("2026-06-01"));

  for (const row of enriched) {
    const key = norm(row.keyword);
    report(
      `published · ${row.keyword.slice(0, 32)}`,
      publishedByKw.get(key) ?? 0,
      row.linksPublished,
    );
    report(
      `indexed   · ${row.keyword.slice(0, 32)}`,
      indexedByKw.get(key) ?? 0,
      row.linksIndexed,
    );
  }

  if (doubleCounted.size) {
    console.log(
      `\n  Note: the workbook counts a link twice when the same keyword sits in\n` +
        `  both anchor slots. Corrected here — affected keywords:`,
    );
    for (const [kw, n] of doubleCounted) {
      console.log(`    "${kw}" — sheet is ${n} higher than the true link count`);
    }
  }

  /* ── 5. Self Analysis: per specialist  (sheet B/C/E) ──────────── */

  section("5. Team performance   (COUNTIFS Backlinks!H)");

  const perExpert = new Map<
    string,
    { links: number; published: number; indexed: number }
  >();
  for (const l of links) {
    const name = l.expert ?? "Unassigned";
    const row = perExpert.get(name) ?? { links: 0, published: 0, indexed: 0 };
    row.links++;
    if (l.status === "Published") row.published++;
    if (l.indexed) row.indexed++;
    perExpert.set(name, row);
  }

  const { getTeamPerformance } = await import("../src/db/queries/team");
  const dbTeam = new Map(
    (await getTeamPerformance(project.id, monthKey("2026-06-01"))).map((m) => [
      m.name,
      m,
    ]),
  );
  for (const [name, row] of [...perExpert].sort((a, b) => b[1].links - a[1].links)) {
    const d = dbTeam.get(name);
    report(`${name} · links`, row.links, d?.allTime.links ?? 0);
    report(`${name} · published`, row.published, d?.allTime.published ?? 0);
    report(`${name} · indexed`, row.indexed, d?.allTime.indexed ?? 0);
  }

  /* ── 6. Analytics: CTR and growth  (sheet I / J) ──────────────── */

  section("6. Search Console   (CTR = clicks/impressions, growth vs prior)");

  const { listAnalytics } = await import("../src/db/queries/analytics");
  const dbAnalytics = await listAnalytics(project.id);
  const dbByMonthKey = new Map(dbAnalytics.map((r) => [r.month, r]));

  const sheetMonths: { month: string; clicks: number; impressions: number; ga: number | null }[] =
    [];
  for (const row of analyticsRows) {
    const m = monthKey(
      (row["Date"] as Date | string | number | null) ?? (row["Month"] as string | null) ?? "",
    );
    if (!m) continue;
    sheetMonths.push({
      month: m,
      clicks: toInt(row["No of Clicks"]) ?? 0,
      impressions: toInt(row["Impressions"]) ?? 0,
      ga: toInt(row["Tracffic"] ?? row["Traffic"]),
    });
  }

  sheetMonths.forEach((row, i) => {
    const d = dbByMonthKey.get(row.month);
    report(`${monthLabel(row.month)} · clicks`, row.clicks, d?.clicks);
    report(`${monthLabel(row.month)} · impressions`, row.impressions, d?.impressions);
    const ctr = row.impressions ? (row.clicks / row.impressions) * 100 : 0;
    report(`${monthLabel(row.month)} · CTR`, ctr.toFixed(4), d?.ctr.toFixed(4));
    if (i > 0) {
      const prev = sheetMonths[i - 1];
      const growth = prev.impressions
        ? ((row.impressions - prev.impressions) / prev.impressions) * 100
        : null;
      report(
        `${monthLabel(row.month)} · impr. growth`,
        growth === null ? "—" : growth.toFixed(2),
        d?.impressionGrowth === null || d?.impressionGrowth === undefined
          ? "—"
          : d.impressionGrowth.toFixed(2),
      );
    }
  });

  /* ── 7. Rankings: every cell  (sheet Keyword Analysis) ────────── */

  section("7. Rank positions   (every keyword × month cell)");

  const analysis = wb.Sheets["Keyword Analysis"];
  const range = XLSX.utils.decode_range(analysis["!ref"] ?? "A1:A1");
  const monthCols: { month: string; posCol: string }[] = [];
  for (let col = 6; col <= range.e.c + 1; col += 3) {
    const raw = cellAt(analysis, `${colName(col)}1`);
    if (!raw) continue;
    const m = monthKey(raw as Date | string);
    if (m) monthCols.push({ month: m, posCol: colName(col + 2) });
  }

  const sheetRanks = new Map<string, number>(); // `${keyword}|${month}` -> position
  for (let r = 3; r <= range.e.r + 1; r++) {
    const kw = cleanText(cellAt(analysis, `B${r}`));
    if (!kw || !keywords.has(kw.toLowerCase())) continue;
    for (const b of monthCols) {
      const pos = toNumber(cellAt(analysis, `${b.posCol}${r}`));
      if (pos === null || pos <= 0) continue;
      sheetRanks.set(`${kw.toLowerCase()}|${b.month}`, pos);
    }
  }

  const dbRankRows = await db
    .select({
      keyword: schema.keywords.keyword,
      month: schema.rankings.month,
      position: schema.rankings.position,
    })
    .from(schema.rankings)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.rankings.keywordId))
    .where(eq(schema.rankings.projectId, project.id));

  const dbRanks = new Map(
    dbRankRows.map((r) => [`${r.keyword.toLowerCase()}|${r.month}`, r.position]),
  );

  report("total rank cells", sheetRanks.size, dbRanks.size);

  let rankMismatches = 0;
  for (const [key, pos] of sheetRanks) {
    const dbPos = dbRanks.get(key);
    if (dbPos === undefined || dbPos === null || Math.abs(dbPos - pos) > 0.001) {
      rankMismatches++;
      checks++;
      failures++;
      if (details.length < 40) {
        details.push(`   rank ${key}\n      sheet=${pos}  db=${dbPos ?? "missing"}`);
      }
    } else {
      checks++;
    }
  }
  console.log(
    `  ${rankMismatches === 0 ? "✓" : "✗"} every rank cell matches`.padEnd(50) +
      `${sheetRanks.size - rankMismatches}/${sheetRanks.size}`,
  );

  /* ── 8. Pages: field-level ────────────────────────────────────── */

  section("8. On-page fields   (per page, all columns)");

  const dbPages = await db
    .select()
    .from(schema.pages)
    .where(eq(schema.pages.projectId, project.id));
  const dbPageByTitle = new Map(dbPages.map((p) => [p.title.trim().toLowerCase(), p]));

  let pageFieldMismatches = 0;
  let pageFieldChecks = 0;
  for (const [key, row] of pages) {
    const d = dbPageByTitle.get(key);
    if (!d) {
      pageFieldMismatches++;
      if (details.length < 40) details.push(`   page missing in db: ${key}`);
      continue;
    }
    const expect: [string, unknown, unknown][] = [
      ["targetUrl", cleanText(row["Target URL"]), d.targetUrl],
      ["focusKeyword", cleanText(row["Focus Keywords"]), d.focusKeyword],
      ["onPageDone", toBool(row["On Page \nStatus"] ?? row["On Page Status"]), d.onPageDone],
      ["indexed", toBool(row["Index"]), d.indexed],
      [
        "wordCount",
        toInt(row["Content\n(Word Count)"] ?? row["Content (Word Count)"]),
        d.wordCount,
      ],
      ["hasFaqs", toBool(row["FAQs"]), d.hasFaqs],
      ["hasBlogSection", toBool(row["Blog Section"]), d.hasBlogSection],
      [
        "hasReviewSection",
        toBool(row["Review \nSection"] ?? row["Review Section"]),
        d.hasReviewSection,
      ],
      [
        "hasCaseStudySection",
        toBool(row["Case Study\nSection"] ?? row["Case Study Section"]),
        d.hasCaseStudySection,
      ],
    ];
    for (const [field, sheetVal, dbVal] of expect) {
      pageFieldChecks++;
      checks++;
      const a = sheetVal === null || sheetVal === undefined ? "—" : String(sheetVal);
      const b = dbVal === null || dbVal === undefined ? "—" : String(dbVal);
      if (a !== b) {
        pageFieldMismatches++;
        failures++;
        if (details.length < 40) {
          details.push(`   page "${key}" ${field}\n      sheet=${a}  db=${b}`);
        }
      }
    }
  }
  console.log(
    `  ${pageFieldMismatches === 0 ? "✓" : "✗"} page fields`.padEnd(50) +
      `${pageFieldChecks - pageFieldMismatches}/${pageFieldChecks}`,
  );

  /* ── 9. Backlinks: field-level ────────────────────────────────── */

  section("9. Backlink fields   (per link, all columns)");

  const dbLinks = await db
    .select()
    .from(schema.backlinks)
    .where(eq(schema.backlinks.projectId, project.id));
  /*
   * Keyed on the whole row, not the URL: the same URL legitimately appears
   * more than once (re-used months later, different specialist, different
   * anchor), so a URL-keyed lookup would compare one sheet row against a
   * different database row and report differences that are not real.
   */
  const staffNameById = new Map(
    (await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)).map(
      (u) => [u.id, u.name],
    ),
  );
  const identityOf = (parts: unknown[]) =>
    parts.map((p) => String(p ?? "").trim().toLowerCase()).join("\u0000");

  const dbLinkByIdentity = new Map(
    dbLinks.map((l) => [
      identityOf([
        l.url,
        l.publishedDate,
        l.anchorText1,
        l.anchorText2,
        l.assigneeId ? staffNameById.get(l.assigneeId) : l.assigneeName,
        l.type,
      ]),
      l,
    ]),
  );

  let linkMismatches = 0;
  let linkChecks = 0;
  for (const l of links) {
    const d = dbLinkByIdentity.get(
      identityOf([l.url, l.date, l.a1, l.a2, l.expert, l.type]),
    );
    if (!d) {
      linkMismatches++;
      if (details.length < 40) details.push(`   link missing in db: ${l.url.slice(0, 60)}`);
      continue;
    }
    const expect: [string, unknown, unknown][] = [
      ["type", l.type, d.type],
      ["status", l.status, d.status],
      ["indexed", l.indexed, d.indexed],
      ["anchor1", l.a1, d.anchorText1],
      ["anchor2", l.a2, d.anchorText2],
      ["publishedDate", l.date, d.publishedDate],
      ["da", l.da, d.da],
      ["spamScore", l.spam, d.spamScore],
    ];
    for (const [field, sheetVal, dbVal] of expect) {
      linkChecks++;
      checks++;
      const a = sheetVal === null || sheetVal === undefined ? "—" : String(sheetVal);
      const b = dbVal === null || dbVal === undefined ? "—" : String(dbVal);
      if (a !== b) {
        linkMismatches++;
        failures++;
        if (details.length < 40) {
          details.push(`   link ${l.url.slice(0, 48)} ${field}\n      sheet=${a}  db=${b}`);
        }
      }
    }
  }
  console.log(
    `  ${linkMismatches === 0 ? "✓" : "✗"} backlink fields`.padEnd(50) +
      `${linkChecks - linkMismatches}/${linkChecks}`,
  );

  /* ── 10. Self Analysis sheet ──────────────────────────────────── */

  section("10. Self Analysis   (the sheet's own totals, per specialist)");

  /*
   * This compares against the values Excel itself calculated and stored, not
   * against a recomputation — so it catches the case where the app agrees with
   * our reading of the raw rows but disagrees with what the client actually
   * sees when they open the workbook.
   */
  const selfSheetName = wb.SheetNames.find((name) => name.startsWith("Self Analysis"));
  if (!selfSheetName) {
    console.log("  · sheet not present, skipped");
  } else {
    const selfSheet = wb.Sheets[selfSheetName];
    const cell = (address: string) => {
      const c = selfSheet[address] as XLSX.CellObject | undefined;
      return c?.v ?? null;
    };

    const dbTotals = await db
      .select({
        links: sql<number>`count(*)`.mapWith(Number),
        indexed: sql<number>`count(*) filter (where ${schema.backlinks.indexed})`.mapWith(
          Number,
        ),
      })
      .from(schema.backlinks)
      .where(eq(schema.backlinks.projectId, project.id));

    const perAgent = await db
      .select({
        name: sql<string>`coalesce(${schema.users.name}, ${schema.backlinks.assigneeName})`,
        links: sql<number>`count(*)`.mapWith(Number),
        published: sql<number>`count(*) filter (where ${schema.backlinks.status} = 'Published')`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${schema.backlinks.indexed})`.mapWith(
          Number,
        ),
      })
      .from(schema.backlinks)
      .leftJoin(schema.users, eq(schema.users.id, schema.backlinks.assigneeId))
      .where(eq(schema.backlinks.projectId, project.id))
      .groupBy(sql`1`);

    const dbByAgent = new Map(
      perAgent.map((a) => [String(a.name ?? "").trim().toLowerCase(), a]),
    );

    report("total backlinks", cell("B2"), dbTotals[0]?.links ?? 0);
    report("indexed backlinks", cell("B3"), dbTotals[0]?.indexed ?? 0);

    // The per-specialist table runs from row 9 down.
    for (let row = 9; row <= 20; row++) {
      const name = cleanText(cell(`A${row}`));
      if (!name) continue;
      const d = dbByAgent.get(name.toLowerCase()) ?? {
        links: 0,
        published: 0,
        indexed: 0,
      };
      report(`${name} · links`, cell(`B${row}`), d.links);
      report(`${name} · published`, cell(`C${row}`), d.published);
      report(`${name} · indexed`, cell(`E${row}`), d.indexed);
    }
  }

  /* ── Summary ──────────────────────────────────────────────────── */

  section("Summary");
  console.log(`  ${checks} checks, ${failures} mismatch${failures === 1 ? "" : "es"}`);
  if (details.length) {
    console.log("\n  First mismatches:");
    details.forEach((d) => console.log(d));
  } else {
    console.log("\n  ✓ The database is an exact reproduction of the workbook.");
  }
  console.log();

  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nParity check failed:", error);
  process.exit(1);
});
