import "./load-env";

import { existsSync } from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";

import {
  cleanText,
  monthKey,
  positionToPage,
  toBool,
  toDateString,
  toInt,
  toNumber,
} from "../src/lib/utils";

/* ════════════════════════════════════════════════════════════════
   Dry run of the workbook import. Touches no database — it parses the
   file exactly the way `db:import` will and reports what would land,
   so you can spot mapping problems before writing anything.

   Usage:
     npm run db:verify -- --file "C:/path/to/workbook.xlsx"
   ════════════════════════════════════════════════════════════════ */

function arg(flag: string, fallback: string) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${flag}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
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

function cellAt(sheet: XLSX.WorkSheet, address: string): unknown {
  return (sheet[address] as XLSX.CellObject | undefined)?.v ?? null;
}

function heading(text: string) {
  console.log(`\n${text}`);
  console.log("─".repeat(Math.max(text.length, 34)));
}

const file = arg(
  "file",
  path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? ".",
    "Downloads",
    "Mindcob New SEO Dashboard.xlsx",
  ),
);

if (!existsSync(file)) {
  console.error(`\n  Workbook not found:\n    ${file}\n`);
  process.exit(1);
}

const wb = XLSX.readFile(file, {
    // Raw serials — see excelSerialToDate. `cellDates: true` would build
    // local-midnight Dates and shift every date a day on a non-UTC host.
    cellDates: false,
  });
console.log(`\nVerifying ${path.basename(file)}`);
console.log(`  sheets: ${wb.SheetNames.join(", ")}`);

const warnings: string[] = [];

/* ── On Page SEO → pages ─────────────────────────────────────── */

heading("On Page SEO → pages");
const pageRows = readSheet(wb, "On Page SEO");
const pageTitles = new Set<string>();
const typeCounts: Record<string, number> = {};
let duplicateTitles = 0;
let missingUrls = 0;

for (const row of pageRows) {
  const title = cleanText(row["Page Title"]);
  if (!title) continue;
  if (pageTitles.has(title.toLowerCase())) {
    duplicateTitles++;
    continue;
  }
  pageTitles.add(title.toLowerCase());
  if (!cleanText(row["Target URL"])) missingUrls++;
  const type = cleanText(row["Type"]) ?? "Page";
  typeCounts[type] = (typeCounts[type] ?? 0) + 1;
}

console.log(`  ${pageTitles.size} pages will be created`);
if (duplicateTitles) {
  console.log(`  ${duplicateTitles} rows share a title with an earlier row — skipped`);
  warnings.push(
    `${duplicateTitles} duplicate page titles will be skipped (titles must be unique per project).`,
  );
}
if (missingUrls) console.log(`  ${missingUrls} pages have no Target URL`);
console.log(
  "  types: " +
    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} ${n}`)
      .join(", "),
);

/* ── Keywords List → keywords ────────────────────────────────── */

heading("Keywords List → keywords");
const keywordRows = readSheet(wb, "Keywords List", 2);
const keywordSet = new Set<string>();
let duplicateKeywords = 0;
let mapped = 0;
let unmappedPage = 0;
let noIntent = 0;
let noVolume = 0;

for (const row of keywordRows) {
  const keyword = cleanText(row["Keywords"]);
  if (!keyword) continue;
  if (keywordSet.has(keyword.toLowerCase())) {
    duplicateKeywords++;
    continue;
  }
  keywordSet.add(keyword.toLowerCase());

  const pageTitle = cleanText(row["Page"]);
  if (pageTitle) {
    if (pageTitles.has(pageTitle.toLowerCase())) mapped++;
    else unmappedPage++;
  }
  if (!cleanText(row["Intent"])) noIntent++;
  if (toInt(row["Traffic"]) === null) noVolume++;
}

console.log(`  ${keywordSet.size} keywords will be created`);
if (duplicateKeywords) {
  console.log(`  ${duplicateKeywords} duplicate keywords — skipped`);
}
console.log(`  ${mapped} map to a page, ${unmappedPage} reference a page that is missing`);
if (unmappedPage) {
  warnings.push(
    `${unmappedPage} keywords name a page that is not in the On Page SEO sheet — they will import unmapped.`,
  );
}
if (noIntent) console.log(`  ${noIntent} have no intent set`);
if (noVolume) console.log(`  ${noVolume} have no search volume`);

/* ── Backlinks → backlinks ───────────────────────────────────── */

heading("Backlinks → backlinks");
const backlinkRows = readSheet(wb, "Backlinks");
const urlSet = new Set<string>();
const experts: Record<string, number> = {};
const statuses: Record<string, number> = {};
let duplicateUrls = 0;
let badUrls = 0;
let datedRows = 0;
let indexedRows = 0;
let anchoredRows = 0;
const anchorCounts = new Map<string, number>();

for (const row of backlinkRows) {
  const url = cleanText(row["Backlinks"]);
  if (!url) continue;
  if (!/^https?:\/\//i.test(url)) {
    badUrls++;
    continue;
  }
  if (urlSet.has(url)) {
    duplicateUrls++;
    continue;
  }
  urlSet.add(url);

  if (toDateString(row["Date"] as Date | string | null)) datedRows++;
  if (toBool(row["Index (Y/N)"])) indexedRows++;

  const status = cleanText(row["Status "] ?? row["Status"]) ?? "(blank)";
  statuses[status] = (statuses[status] ?? 0) + 1;

  const expert = cleanText(row["Expert Name"]);
  if (expert) experts[expert] = (experts[expert] ?? 0) + 1;

  const a1 = cleanText(row["Anchor text 1"]);
  const a2 = cleanText(row["Anchor text 2"]);
  if (a1 || a2) anchoredRows++;
  for (const anchor of [a1, a2]) {
    if (!anchor) continue;
    const key = anchor.toLowerCase();
    anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
  }
}

console.log(`  ${urlSet.size} links will be created`);
if (duplicateUrls) console.log(`  ${duplicateUrls} duplicate URLs — skipped`);
if (badUrls) console.log(`  ${badUrls} rows had no usable URL — skipped`);
console.log(
  `  ${datedRows} have a parseable date, ${indexedRows} are marked indexed, ${anchoredRows} carry anchor text`,
);
console.log(
  "  statuses: " +
    Object.entries(statuses)
      .map(([s, n]) => `${s} ${n}`)
      .join(", "),
);
console.log(
  "  specialists: " +
    Object.entries(experts)
      .sort((a, b) => b[1] - a[1])
      .map(([e, n]) => `${e} ${n}`)
      .join(", "),
);

if (urlSet.size - datedRows > 0) {
  warnings.push(
    `${urlSet.size - datedRows} backlinks have no date — they will not appear in any monthly total.`,
  );
}
if (urlSet.size - anchoredRows > 0) {
  warnings.push(
    `${urlSet.size - anchoredRows} backlinks have no anchor text — they cannot count towards a keyword's target.`,
  );
}

/* ── Anchor → keyword join ───────────────────────────────────── */

heading("Anchor text → keyword join");
const matchedAnchors = [...anchorCounts.keys()].filter((a) => keywordSet.has(a));
console.log(
  `  ${anchorCounts.size} distinct anchors, ${matchedAnchors.length} match a tracked keyword`,
);
const topMatched = matchedAnchors
  .map((a) => [a, anchorCounts.get(a)!] as const)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6);
if (topMatched.length) {
  console.log("  most-linked keywords:");
  for (const [anchor, count] of topMatched) {
    console.log(`    ${count.toString().padStart(4)}  ${anchor}`);
  }
}
const unmatchedAnchors = anchorCounts.size - matchedAnchors.length;
if (unmatchedAnchors > 0) {
  warnings.push(
    `${unmatchedAnchors} anchor texts do not match any tracked keyword — those links count towards the profile total but no keyword target.`,
  );
}

/* ── Keyword Analysis → rankings ─────────────────────────────── */

heading("Keyword Analysis → rankings");
const analysisSheet = wb.Sheets["Keyword Analysis"];

if (!analysisSheet) {
  console.log("  sheet not found — rankings would be skipped");
} else {
  const range = XLSX.utils.decode_range(analysisSheet["!ref"] ?? "A1:A1");
  const monthBlocks: { month: string; pageCol: string; positionCol: string }[] = [];

  for (let col = 6; col <= range.e.c + 1; col += 3) {
    const raw = cellAt(analysisSheet, `${colName(col)}1`);
    if (!raw) continue;
    const month = monthKey(raw as Date | string);
    if (!month) continue;
    monthBlocks.push({
      month,
      pageCol: colName(col + 1),
      positionCol: colName(col + 2),
    });
  }

  console.log(`  ${monthBlocks.length} month columns detected:`);
  console.log(`    ${monthBlocks.map((b) => b.month.slice(0, 7)).join("  ")}`);

  let positions = 0;
  let unknownKeywords = 0;
  const perMonth = new Map<string, number>();

  for (let row = 3; row <= range.e.r + 1; row++) {
    const keyword = cleanText(cellAt(analysisSheet, `B${row}`));
    if (!keyword) continue;
    if (!keywordSet.has(keyword.toLowerCase())) {
      unknownKeywords++;
      continue;
    }
    for (const block of monthBlocks) {
      const position = toNumber(cellAt(analysisSheet, `${block.positionCol}${row}`));
      if (position === null || position <= 0) continue;
      positions++;
      perMonth.set(block.month, (perMonth.get(block.month) ?? 0) + 1);
    }
  }

  console.log(`  ${positions} positions will be imported`);
  console.log(
    "  per month: " +
      [...perMonth.entries()]
        .sort()
        .map(([m, n]) => `${m.slice(0, 7)}=${n}`)
        .join(" "),
  );
  if (unknownKeywords) {
    console.log(`  ${unknownKeywords} rows name a keyword absent from Keywords List`);
    warnings.push(
      `${unknownKeywords} rows in Keyword Analysis reference keywords that are not in the Keywords List — their positions will be skipped.`,
    );
  }

  // Spot-check that the sheet's Page column agrees with position ÷ 10.
  let disagreements = 0;
  for (let row = 3; row <= Math.min(range.e.r + 1, 200); row++) {
    for (const block of monthBlocks) {
      const position = toNumber(cellAt(analysisSheet, `${block.positionCol}${row}`));
      const sheetPage = toNumber(cellAt(analysisSheet, `${block.pageCol}${row}`));
      if (position === null || sheetPage === null) continue;
      const derived = positionToPage(position);
      if (derived !== null && Math.abs(derived - sheetPage) > 1) disagreements++;
    }
  }
  if (disagreements) {
    console.log(
      `  note: ${disagreements} cells where the sheet's Page disagrees with position ÷ 10 — the sheet value is kept`,
    );
  }
}

/* ── Analytics → analytics_snapshots ─────────────────────────── */

heading("Analytics & Search Console → monthly data");
const analyticsRows = readSheet(wb, "Analytics and Search Console Da", 2);
const monthKeys = new Set<string>();
let cappedLabels = 0;
let missingGa = 0;

for (const row of analyticsRows) {
  const month = monthKey(
    (row["Date"] as Date | string | null) ?? (row["Month"] as string | null) ?? "",
  );
  if (!month) continue;
  const country = cleanText(row["Country"]) ?? "Canada";
  const key = `${month}:${country}`;
  if (monthKeys.has(key)) continue;
  monthKeys.add(key);

  const keywordRaw = cleanText(row["Keywords"]);
  if (keywordRaw && /\+/.test(keywordRaw)) cappedLabels++;
  if (toInt(row["Tracffic"] ?? row["Traffic"]) === null) missingGa++;
}

console.log(`  ${monthKeys.size} month rows will be imported`);
if (cappedLabels) {
  console.log(`  ${cappedLabels} use a capped keyword label like "1000+" (kept verbatim)`);
}
if (missingGa) console.log(`  ${missingGa} have no GA sessions figure`);

/* ── Summary ─────────────────────────────────────────────────── */

heading("Summary");
console.log(`  pages        ${pageTitles.size}`);
console.log(`  keywords     ${keywordSet.size}`);
console.log(`  backlinks    ${urlSet.size}`);
console.log(`  months data  ${monthKeys.size}`);

if (warnings.length) {
  heading(`Worth knowing (${warnings.length})`);
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
} else {
  console.log("\n  No issues found.");
}

console.log("\nNothing was written. Run `npm run db:import` to load it for real.\n");
