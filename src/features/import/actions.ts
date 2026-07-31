"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { getPageTitleMap } from "@/db/queries/pages";
import { logActivity } from "@/db/queries/projects";
import {
  analyticsSnapshots,
  backlinks,
  keywords,
  pages,
  rankings,
  users,
} from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidateProject } from "@/lib/cache";
import {
  BACKLINK_STATUSES,
  BACKLINK_TYPES,
  KEYWORD_INTENTS,
  PAGE_TYPES,
} from "@/lib/constants";
import { pick, parseTable } from "@/lib/csv";
import {
  cleanText,
  monthKey,
  normalizeLinkUrl,
  positionToPage,
  toBool,
  toDateString,
  toInt,
  toNumber,
} from "@/lib/utils";
import { importSchema } from "@/lib/validations";

export type ImportReport = {
  entity: string;
  parsed: number;
  inserted: number;
  updated: number;
  skipped: number;
  created?: { pages?: number; keywords?: number };
  warnings: string[];
};

/** Snaps a free-text value onto one of our enum options, case-insensitively. */
function matchEnum<T extends readonly string[]>(
  value: string | undefined,
  options: T,
  fallback: T[number] | null = null,
): T[number] | null {
  if (!value) return fallback;
  const needle = value.trim().toLowerCase();
  const hit = options.find((o) => o.toLowerCase() === needle);
  if (hit) return hit;
  // Tolerate "guest post" for "Guest Posts", "web2.0" for "Web 2.0", etc.
  const loose = options.find(
    (o) =>
      o.toLowerCase().replace(/[^a-z0-9]/g, "") ===
      needle.replace(/[^a-z0-9]/g, ""),
  );
  return loose ?? fallback;
}

const CHUNK = 400;

/**
 * Collapses rows that share an ON CONFLICT target, keeping the last one.
 *
 * Postgres refuses an `INSERT … ON CONFLICT DO UPDATE` batch that would touch
 * the same row twice (SQLSTATE 21000), and it aborts the whole statement — so
 * one repeated keyword in a pasted export failed the import part-way through,
 * with earlier chunks already committed. Real exports repeat keys routinely:
 * a rank tracker emits one row per keyword per device, and the same page can
 * be listed twice. Last-wins matches what the upsert would have done anyway.
 */
function dedupeByConflictKey<T>(
  values: T[],
  key: (row: T) => string,
): { rows: T[]; collapsed: number } {
  const byKey = new Map<string, T>();
  for (const row of values) byKey.set(key(row), row);
  return { rows: [...byKey.values()], collapsed: values.length - byKey.size };
}

/** Wording shared by every importer that can collapse repeated rows. */
function collapsedWarning(collapsed: number, what: string): string[] {
  if (!collapsed) return [];
  return [
    `${collapsed} row${collapsed === 1 ? "" : "s"} repeated the same ${what} and only the last of each was kept.`,
  ];
}

export async function importDataAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<ImportReport>> {
  const user = await requireStaff();
  const parsed = parseForm(importSchema, formData);
  if (!parsed.success) return fail("Check the form.", parsed.errors);

  const { projectId, entity, content, createMissing, month } = parsed.data;
  if (!user.projectIds.includes(projectId)) {
    return fail("You do not have access to that project.");
  }

  const table = parseTable(content);
  if (!table.rows.length) {
    return fail("No data rows found. Include a header row, then the data.");
  }

  try {
    let report: ImportReport;
    switch (entity) {
      case "backlinks":
        report = await importBacklinks(projectId, table.rows);
        break;
      case "keywords":
        report = await importKeywords(projectId, table.rows, createMissing);
        break;
      case "pages":
        report = await importPages(projectId, table.rows);
        break;
      case "analytics":
        report = await importAnalytics(projectId, table.rows);
        break;
      case "rankings":
        report = await importRankings(projectId, table.rows, month);
        break;
      default:
        return fail("Unsupported import type.");
    }

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "imported",
      entity,
      summary: `Imported ${entity}: ${report.inserted} added, ${report.updated} updated, ${report.skipped} skipped`,
      meta: report,
    });

    // Every importer here rewrites data the dashboards aggregate, and a
    // keyword import can create pages as a side effect, so the whole
    // project's data cache is dropped rather than the one named entity.
    invalidateProject(projectId);

    revalidatePath(`/app/projects/${projectId}`, "layout");
    revalidatePath("/portal", "layout");

    return ok(
      `${report.inserted} added, ${report.updated} updated, ${report.skipped} skipped.`,
      report,
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/* ── Backlinks ─────────────────────────────────────────────────── */

async function importBacklinks(
  projectId: string,
  rows: Record<string, string>[],
): Promise<ImportReport> {
  const warnings: string[] = [];

  // Match "Expert Name" text to real accounts where we can.
  const staff = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users);
  const byName = new Map(staff.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const byEmail = new Map(staff.map((s) => [s.email.trim().toLowerCase(), s.id]));

  const values: (typeof backlinks.$inferInsert)[] = [];
  let skipped = 0;

  for (const row of rows) {
    const url = normalizeLinkUrl(pick(row, "backlinks", "url", "link", "backlink url"));
    if (!url) {
      skipped++;
      continue;
    }

    const assigneeRaw = cleanText(pick(row, "expert name", "expert", "assignee", "user name"));
    const assigneeId = assigneeRaw
      ? (byName.get(assigneeRaw.toLowerCase()) ??
        byEmail.get(assigneeRaw.toLowerCase()) ??
        null)
      : null;

    // Fall back to the "Month" column when no explicit date is present.
    const dateRaw = pick(row, "date", "published date", "publish date");
    const monthRaw = pick(row, "month");
    const publishedDate = toDateString(dateRaw ?? monthRaw ?? null);

    values.push({
      projectId,
      url,
      type: matchEnum(pick(row, "type", "link type"), BACKLINK_TYPES, "Miscellaneous")!,
      status: matchEnum(pick(row, "status"), BACKLINK_STATUSES, "Published")!,
      indexed: toBool(pick(row, "index yn", "index", "indexed")),
      anchorText1: cleanText(pick(row, "anchor text 1", "anchor text", "anchor1", "anchor")),
      anchorText2: cleanText(pick(row, "anchor text 2", "anchor2")),
      publishedDate,
      assigneeId,
      assigneeName: assigneeId ? null : assigneeRaw,
      da: toNumber(pick(row, "da", "domain authority")),
      pa: toNumber(pick(row, "pa", "page authority")),
      spamScore: toNumber(pick(row, "spam score", "spam", "ss")),
      loginUser: cleanText(pick(row, "user", "login", "username")),
      loginPassword: cleanText(pick(row, "password", "pass")),
      notes: cleanText(pick(row, "notes", "remarks", "comment")),
    });
  }

  if (assigneeWarning(rows, byName, byEmail)) {
    warnings.push(
      "Some “Expert Name” values did not match a user account — they were stored as plain text. Create those accounts and re-import to link them.",
    );
  }

  let inserted = 0;
  let updated = 0;

  /*
   * A placement is identified by the whole row, not by its URL. The same site
   * is routinely used again months later by a different specialist with
   * different anchor text, and each of those is separate work owed to whoever
   * did it. Keying on the URL alone meant one UPDATE overwrote every row
   * sharing it — collapsing distinct placements and losing the older one's
   * date, anchors, type and assignee.
   *
   * Matching on identity means a re-upload refreshes the volatile metrics of a
   * placement it already knows about, and adds the ones it does not.
   */
  const nameById = new Map(staff.map((s) => [s.id, s.name]));
  const identityOf = (row: {
    url: string;
    publishedDate?: string | null;
    anchorText1?: string | null;
    anchorText2?: string | null;
    assigneeId?: string | null;
    assigneeName?: string | null;
    type?: string | null;
  }) =>
    [
      row.url,
      row.publishedDate,
      row.anchorText1,
      row.anchorText2,
      row.assigneeId ? nameById.get(row.assigneeId) : row.assigneeName,
      row.type,
    ]
      .map((part) => String(part ?? "").trim().toLowerCase())
      .join("\u0000");

  const existingRows = await db
    .select({
      id: backlinks.id,
      url: backlinks.url,
      publishedDate: backlinks.publishedDate,
      anchorText1: backlinks.anchorText1,
      anchorText2: backlinks.anchorText2,
      assigneeId: backlinks.assigneeId,
      assigneeName: backlinks.assigneeName,
      type: backlinks.type,
    })
    .from(backlinks)
    .where(eq(backlinks.projectId, projectId));

  const idByIdentity = new Map(existingRows.map((r) => [identityOf(r), r.id]));

  const toInsert: typeof values = [];
  const toRefresh: { id: string; row: (typeof values)[number] }[] = [];
  for (const row of values) {
    const existingId = idByIdentity.get(identityOf(row));
    if (existingId) toRefresh.push({ id: existingId, row });
    else toInsert.push(row);
  }

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await db.insert(backlinks).values(toInsert.slice(i, i + CHUNK));
    inserted += toInsert.slice(i, i + CHUNK).length;
  }

  // Only the values that genuinely change between exports — the fields in the
  // identity are what made this the same row in the first place.
  for (const { id, row } of toRefresh) {
    await db
      .update(backlinks)
      .set({
        status: row.status,
        indexed: row.indexed,
        da: row.da,
        pa: row.pa,
        spamScore: row.spamScore,
        loginUser: row.loginUser,
        loginPassword: row.loginPassword,
        notes: row.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(backlinks.id, id), eq(backlinks.projectId, projectId)));
    updated++;
  }

  return {
    entity: "backlinks",
    parsed: rows.length,
    inserted,
    updated,
    skipped,
    warnings,
  };
}

function assigneeWarning(
  rows: Record<string, string>[],
  byName: Map<string, string>,
  byEmail: Map<string, string>,
) {
  return rows.some((row) => {
    const name = cleanText(pick(row, "expert name", "expert", "assignee"));
    if (!name) return false;
    const key = name.toLowerCase();
    return !byName.has(key) && !byEmail.has(key);
  });
}

/* ── Keywords ──────────────────────────────────────────────────── */

async function importKeywords(
  projectId: string,
  rows: Record<string, string>[],
  createMissingPages: boolean,
): Promise<ImportReport> {
  const warnings: string[] = [];
  let pageTitles = await getPageTitleMap(projectId);
  let createdPages = 0;

  // Create any referenced page that does not exist yet, so keyword → page
  // mapping survives the import in one pass.
  if (createMissingPages) {
    const wanted = new Map<string, { title: string; url: string | null }>();
    for (const row of rows) {
      const title = cleanText(pick(row, "page", "page title"));
      if (!title || pageTitles.has(title.toLowerCase())) continue;
      wanted.set(title.toLowerCase(), {
        title,
        url: cleanText(pick(row, "target url", "url")),
      });
    }
    if (wanted.size) {
      const newPages = Array.from(wanted.values()).map((p, i) => ({
        projectId,
        title: p.title,
        targetUrl: p.url,
        type: "Page" as const,
        sortOrder: 1000 + i,
      }));
      for (let i = 0; i < newPages.length; i += CHUNK) {
        await db
          .insert(pages)
          .values(newPages.slice(i, i + CHUNK))
          .onConflictDoNothing();
      }
      createdPages = newPages.length;
      pageTitles = await getPageTitleMap(projectId);
    }
  }

  const values: (typeof keywords.$inferInsert)[] = [];
  let skipped = 0;
  let unmapped = 0;

  for (const row of rows) {
    const keyword = cleanText(pick(row, "keywords", "keyword", "query"));
    if (!keyword) {
      skipped++;
      continue;
    }

    const pageTitle = cleanText(pick(row, "page", "page title"));
    const pageId = pageTitle ? (pageTitles.get(pageTitle.toLowerCase()) ?? null) : null;
    if (pageTitle && !pageId) unmapped++;

    const cpc = toNumber(pick(row, "cpc"));

    values.push({
      projectId,
      keyword,
      intent: matchEnum(pick(row, "intent"), KEYWORD_INTENTS),
      // The sheet labelled search volume "Traffic".
      volume: toInt(pick(row, "traffic", "volume", "search volume", "vol")),
      kd: toNumber(pick(row, "kd", "difficulty", "keyword difficulty")),
      cpc: cpc === null ? null : String(cpc),
      competition: toNumber(pick(row, "competition")),
      ads: toInt(pick(row, "ads")),
      pageId,
      priority: toBool(pick(row, "priority")),
      backlinkTarget: toInt(pick(row, "target", "backlink target")) ?? 0,
      monthlyTarget: toInt(pick(row, "monthly target")),
    });
  }

  if (unmapped) {
    warnings.push(
      `${unmapped} row${unmapped === 1 ? "" : "s"} referenced a page that does not exist. Tick “create missing pages” to add them automatically.`,
    );
  }

  let inserted = 0;
  let updated = 0;

  const { rows: deduped, collapsed } = dedupeByConflictKey(values, (r) => `${r.projectId}\u0000${r.keyword}`);
  warnings.push(...collapsedWarning(collapsed, "keyword"));

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const slice = deduped.slice(i, i + CHUNK);
    const result = await db
      .insert(keywords)
      .values(slice)
      .onConflictDoUpdate({
        target: [keywords.projectId, keywords.keyword],
        set: {
          intent: sql`coalesce(excluded.intent, ${keywords.intent})`,
          volume: sql`coalesce(excluded.volume, ${keywords.volume})`,
          kd: sql`coalesce(excluded.kd, ${keywords.kd})`,
          cpc: sql`coalesce(excluded.cpc, ${keywords.cpc})`,
          competition: sql`coalesce(excluded.competition, ${keywords.competition})`,
          ads: sql`coalesce(excluded.ads, ${keywords.ads})`,
          pageId: sql`coalesce(excluded.page_id, ${keywords.pageId})`,
          priority: sql`excluded.priority`,
          backlinkTarget: sql`excluded.backlink_target`,
          monthlyTarget: sql`coalesce(excluded.monthly_target, ${keywords.monthlyTarget})`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: keywords.id, createdAt: keywords.createdAt });
    // Rows whose createdAt is fresh were inserts; the rest were updates.
    const now = Date.now();
    for (const r of result) {
      if (now - new Date(r.createdAt).getTime() < 5000) inserted++;
      else updated++;
    }
  }

  return {
    entity: "keywords",
    parsed: rows.length,
    inserted,
    updated,
    skipped,
    created: { pages: createdPages },
    warnings,
  };
}

/* ── Pages ─────────────────────────────────────────────────────── */

async function importPages(
  projectId: string,
  rows: Record<string, string>[],
): Promise<ImportReport> {
  const warnings: string[] = [];
  const values: (typeof pages.$inferInsert)[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const title = cleanText(pick(row, "page title", "title", "page"));
    if (!title) {
      skipped++;
      return;
    }

    const score = cleanText(pick(row, "seo score", "score"));

    values.push({
      projectId,
      title,
      targetUrl: cleanText(pick(row, "target url", "url")),
      focusKeyword: cleanText(pick(row, "focus keywords", "focus keyword")),
      type: matchEnum(pick(row, "type", "page type"), PAGE_TYPES, "Page")!,
      onPageDone: toBool(pick(row, "on page status", "on page", "status")),
      // Keep the sheet's bucket style ("70+"), normalising bare numbers.
      seoScore: score ? (/\+$/.test(score) ? score : `${score.replace(/[^0-9]/g, "")}+`) : null,
      indexed: toBool(pick(row, "index", "indexed")),
      wordCount: toInt(pick(row, "content word count", "word count", "content", "words")),
      hasFaqs: toBool(pick(row, "faqs", "faq")),
      hasBlogSection: toBool(pick(row, "blog section", "blog")),
      hasReviewSection: toBool(pick(row, "review section", "reviews")),
      hasCaseStudySection: toBool(pick(row, "case study section", "case study")),
      metaTitle: cleanText(pick(row, "meta title")),
      metaDescription: cleanText(pick(row, "meta description")),
      notes: cleanText(pick(row, "notes", "remarks")),
      sortOrder: toInt(pick(row, "sr no", "srno", "sort order")) ?? index + 1,
    });
  });

  let inserted = 0;
  let updated = 0;

  const { rows: deduped, collapsed } = dedupeByConflictKey(values, (r) => `${r.projectId}\u0000${r.title}`);
  warnings.push(...collapsedWarning(collapsed, "page title"));

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const result = await db
      .insert(pages)
      .values(deduped.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [pages.projectId, pages.title],
        set: {
          targetUrl: sql`coalesce(excluded.target_url, ${pages.targetUrl})`,
          focusKeyword: sql`coalesce(excluded.focus_keyword, ${pages.focusKeyword})`,
          type: sql`excluded.type`,
          onPageDone: sql`excluded.on_page_done`,
          seoScore: sql`coalesce(excluded.seo_score, ${pages.seoScore})`,
          indexed: sql`excluded.indexed`,
          wordCount: sql`coalesce(excluded.word_count, ${pages.wordCount})`,
          hasFaqs: sql`excluded.has_faqs`,
          hasBlogSection: sql`excluded.has_blog_section`,
          hasReviewSection: sql`excluded.has_review_section`,
          hasCaseStudySection: sql`excluded.has_case_study_section`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: pages.id, createdAt: pages.createdAt });

    const now = Date.now();
    for (const r of result) {
      if (now - new Date(r.createdAt).getTime() < 5000) inserted++;
      else updated++;
    }
  }

  return { entity: "pages", parsed: rows.length, inserted, updated, skipped, warnings };
}

/* ── Analytics ─────────────────────────────────────────────────── */

async function importAnalytics(
  projectId: string,
  rows: Record<string, string>[],
): Promise<ImportReport> {
  const warnings: string[] = [];
  const values: (typeof analyticsSnapshots.$inferInsert)[] = [];
  let skipped = 0;

  for (const row of rows) {
    const monthRaw = pick(row, "month") ?? pick(row, "date");
    const month = monthRaw ? monthKey(monthRaw) : "";
    if (!month) {
      skipped++;
      continue;
    }

    const keywordRaw = cleanText(pick(row, "keywords", "keyword count"));
    const numericKeywords = keywordRaw ? toInt(keywordRaw.replace(/\+/g, "")) : null;

    values.push({
      projectId,
      month,
      capturedOn: toDateString(pick(row, "date")),
      country: cleanText(pick(row, "country")) ?? "Canada",
      clicks: toInt(pick(row, "no of clicks", "clicks")) ?? 0,
      impressions: toInt(pick(row, "impressions")) ?? 0,
      keywordCount: numericKeywords,
      // "1000+" is kept verbatim so the report reads the way the client expects.
      keywordCountLabel: keywordRaw && /\+/.test(keywordRaw) ? keywordRaw : null,
      gaTraffic: toInt(pick(row, "tracffic", "traffic", "sessions", "ga traffic")),
      avgPosition: toNumber(pick(row, "avg position", "average position", "position")),
      notes: cleanText(pick(row, "notes")),
    });
  }

  let inserted = 0;
  let updated = 0;

  const { rows: deduped, collapsed } = dedupeByConflictKey(values, (r) => `${r.projectId}\u0000${r.month}\u0000${r.country ?? ""}`);
  warnings.push(...collapsedWarning(collapsed, "month"));

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const result = await db
      .insert(analyticsSnapshots)
      .values(deduped.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [
          analyticsSnapshots.projectId,
          analyticsSnapshots.month,
          analyticsSnapshots.country,
        ],
        set: {
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          keywordCount: sql`coalesce(excluded.keyword_count, ${analyticsSnapshots.keywordCount})`,
          keywordCountLabel: sql`excluded.keyword_count_label`,
          gaTraffic: sql`coalesce(excluded.ga_traffic, ${analyticsSnapshots.gaTraffic})`,
          avgPosition: sql`coalesce(excluded.avg_position, ${analyticsSnapshots.avgPosition})`,
          capturedOn: sql`coalesce(excluded.captured_on, ${analyticsSnapshots.capturedOn})`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: analyticsSnapshots.id, createdAt: analyticsSnapshots.createdAt });

    const now = Date.now();
    for (const r of result) {
      if (now - new Date(r.createdAt).getTime() < 5000) inserted++;
      else updated++;
    }
  }

  return {
    entity: "analytics",
    parsed: rows.length,
    inserted,
    updated,
    skipped,
    warnings,
  };
}

/* ── Rankings ──────────────────────────────────────────────────── */

async function importRankings(
  projectId: string,
  rows: Record<string, string>[],
  monthInput: string | undefined,
): Promise<ImportReport> {
  const warnings: string[] = [];
  const fallbackMonth = monthInput
    ? monthKey(monthInput.length === 7 ? `${monthInput}-01` : monthInput)
    : "";

  const existing = await db
    .select({ id: keywords.id, keyword: keywords.keyword })
    .from(keywords)
    .where(eq(keywords.projectId, projectId));
  const byKeyword = new Map(existing.map((k) => [k.keyword.trim().toLowerCase(), k.id]));

  const values: (typeof rankings.$inferInsert)[] = [];
  let skipped = 0;
  let unknownKeywords = 0;

  for (const row of rows) {
    const keyword = cleanText(pick(row, "keywords", "keyword", "query"));
    if (!keyword) {
      skipped++;
      continue;
    }

    const keywordId = byKeyword.get(keyword.toLowerCase());
    if (!keywordId) {
      unknownKeywords++;
      skipped++;
      continue;
    }

    // A per-row month column wins over the form's month picker.
    const rowMonth = pick(row, "month");
    const month = rowMonth ? monthKey(rowMonth) : fallbackMonth;
    if (!month) {
      skipped++;
      continue;
    }

    const position = toNumber(pick(row, "position", "rank", "pos"));
    if (position === null || position <= 0) {
      skipped++;
      continue;
    }

    values.push({
      projectId,
      keywordId,
      month,
      checkedOn: toDateString(pick(row, "date", "checked on")),
      position,
      page: toNumber(pick(row, "page")) ?? positionToPage(position) ?? 1,
    });
  }

  if (unknownKeywords) {
    warnings.push(
      `${unknownKeywords} keyword${unknownKeywords === 1 ? "" : "s"} in the paste are not tracked in this project yet. Import them on the Keywords tab first.`,
    );
  }

  let inserted = 0;
  let updated = 0;

  const { rows: deduped, collapsed } = dedupeByConflictKey(values, (r) => `${r.keywordId}\u0000${r.month}`);
  warnings.push(...collapsedWarning(collapsed, "keyword and month"));

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const result = await db
      .insert(rankings)
      .values(deduped.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [rankings.keywordId, rankings.month],
        set: {
          position: sql`excluded.position`,
          page: sql`excluded.page`,
          checkedOn: sql`coalesce(excluded.checked_on, ${rankings.checkedOn})`,
        },
      })
      .returning({ id: rankings.id, createdAt: rankings.createdAt });

    const now = Date.now();
    for (const r of result) {
      if (now - new Date(r.createdAt).getTime() < 5000) inserted++;
      else updated++;
    }
  }

  return {
    entity: "rankings",
    parsed: rows.length,
    inserted,
    updated,
    skipped,
    warnings,
  };
}
