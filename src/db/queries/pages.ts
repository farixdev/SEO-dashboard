import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { keywords, pages, rankings } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import type { ListQuery } from "@/lib/query";
import { currentMonthKey } from "@/lib/utils";

export type PageRow = {
  id: string;
  title: string;
  targetUrl: string | null;
  focusKeyword: string | null;
  type: string;
  onPageDone: boolean;
  seoScore: string | null;
  indexed: boolean;
  wordCount: number | null;
  hasFaqs: boolean;
  hasBlogSection: boolean;
  hasReviewSection: boolean;
  hasCaseStudySection: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  notes: string | null;
  /** derived */
  keywordCount: number;
  page1Count: number;
  bestPosition: number | null;
};

const SORTABLE = {
  title: pages.title,
  type: pages.type,
  seoScore: pages.seoScore,
  wordCount: pages.wordCount,
  onPageDone: pages.onPageDone,
  indexed: pages.indexed,
  sortOrder: pages.sortOrder,
  createdAt: pages.createdAt,
} as const;

function buildWhere(projectId: string, query: ListQuery) {
  const clauses: (SQL | undefined)[] = [eq(pages.projectId, projectId)];
  const { q, filters } = query;

  if (q) {
    const like = `%${q}%`;
    clauses.push(
      or(
        ilike(pages.title, like),
        ilike(pages.targetUrl, like),
        ilike(pages.focusKeyword, like),
      ),
    );
  }
  if (filters.type) clauses.push(eq(pages.type, filters.type));
  if (filters.score) clauses.push(eq(pages.seoScore, filters.score));
  if (filters.onPage === "done") clauses.push(eq(pages.onPageDone, true));
  if (filters.onPage === "pending") clauses.push(eq(pages.onPageDone, false));
  if (filters.indexed === "yes") clauses.push(eq(pages.indexed, true));
  if (filters.indexed === "no") clauses.push(eq(pages.indexed, false));
  if (filters.faqs === "yes") clauses.push(eq(pages.hasFaqs, true));
  if (filters.faqs === "no") clauses.push(eq(pages.hasFaqs, false));
  if (filters.minWords) clauses.push(gte(pages.wordCount, Number(filters.minWords)));
  if (filters.maxWords) clauses.push(lte(pages.wordCount, Number(filters.maxWords)));

  return and(...clauses.filter(Boolean));
}

async function uncachedListPages(
  projectId: string,
  query: ListQuery,
  options: { month?: string } = {},
) {
  const month = options.month ?? currentMonthKey();
  const where = buildWhere(projectId, query);
  const sortColumn = SORTABLE[query.sort as keyof typeof SORTABLE] ?? pages.sortOrder;
  const orderExpr =
    query.dir === "asc"
      ? sql`${sortColumn} asc nulls last`
      : sql`${sortColumn} desc nulls last`;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: pages.id,
        title: pages.title,
        targetUrl: pages.targetUrl,
        focusKeyword: pages.focusKeyword,
        type: pages.type,
        onPageDone: pages.onPageDone,
        seoScore: pages.seoScore,
        indexed: pages.indexed,
        wordCount: pages.wordCount,
        hasFaqs: pages.hasFaqs,
        hasBlogSection: pages.hasBlogSection,
        hasReviewSection: pages.hasReviewSection,
        hasCaseStudySection: pages.hasCaseStudySection,
        metaTitle: pages.metaTitle,
        metaDescription: pages.metaDescription,
        notes: pages.notes,
      })
      .from(pages)
      .where(where)
      .orderBy(orderExpr, asc(pages.title))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({
        total: count().mapWith(Number),
        optimised: sql<number>`count(*) filter (where ${pages.onPageDone})`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${pages.indexed})`.mapWith(Number),
        avgWords: sql<number | null>`avg(${pages.wordCount})`.mapWith(Number),
      })
      .from(pages)
      .where(where),
  ]);

  const enriched = await attachPageMetrics(rows, month);

  return {
    rows: enriched,
    total: totals[0]?.total ?? 0,
    summary: {
      optimised: totals[0]?.optimised ?? 0,
      indexed: totals[0]?.indexed ?? 0,
      avgWords: totals[0]?.avgWords ?? null,
    },
  };
}

/**
 * Cached: the table itself is the slowest query on the page, and it only
 * changes when someone edits data — which always invalidates these tags.
 */
export const listPages = cachedQuery(
  "pages:listPages",
  uncachedListPages,
  (projectId: string, _query: ListQuery, _options?: { month?: string }) => [
    tags.project(projectId),
  ],
  CACHE_TTL.aggregate,
);


/** Sheet column M — keyword count per page, plus how many rank on page 1. */
async function attachPageMetrics<T extends { id: string }>(rows: T[], month: string) {
  if (!rows.length) return [] as (T & { keywordCount: number; page1Count: number; bestPosition: number | null })[];
  const ids = rows.map((r) => r.id);

  const stats = await db
    .select({
      pageId: keywords.pageId,
      keywordCount: count(keywords.id).mapWith(Number),
      page1Count: sql<number>`count(r.position) filter (where r.position <= 10)`.mapWith(
        Number,
      ),
      bestPosition: sql<number | null>`min(r.position)`.mapWith(Number),
    })
    .from(keywords)
    .leftJoin(
      sql`${rankings} as r`,
      sql`r.keyword_id = ${keywords.id} and r.month = ${month}`,
    )
    .where(inArray(keywords.pageId, ids))
    .groupBy(keywords.pageId);

  const byPage = new Map(stats.map((s) => [s.pageId, s]));
  return rows.map((row) => {
    const s = byPage.get(row.id);
    return {
      ...row,
      keywordCount: s?.keywordCount ?? 0,
      page1Count: s?.page1Count ?? 0,
      bestPosition: s?.bestPosition ?? null,
    };
  });
}

export async function getPage(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, projectId), eq(pages.id, id)))
    .limit(1);
  return row ?? null;
}

/** Keywords mapped to a page, with their current position. */
export async function getPageKeywords(pageId: string, month: string) {
  return db
    .select({
      id: keywords.id,
      keyword: keywords.keyword,
      intent: keywords.intent,
      volume: keywords.volume,
      kd: keywords.kd,
      priority: keywords.priority,
      position: sql<number | null>`r.position`.mapWith(Number),
      page: sql<number | null>`r.page`.mapWith(Number),
    })
    .from(keywords)
    .leftJoin(
      sql`${rankings} as r`,
      sql`r.keyword_id = ${keywords.id} and r.month = ${month}`,
    )
    .where(eq(keywords.pageId, pageId))
    .orderBy(sql`r.position asc nulls last`, desc(keywords.volume))
    .limit(200);
}

/** Not cached: the importer re-reads this immediately after inserting pages,
 *  in the same request, to map keywords onto the rows it just created. */
async function uncachedGetPageTitleMap(projectId: string) {
  const rows = await db
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(eq(pages.projectId, projectId));
  return new Map(rows.map((r) => [r.title.trim().toLowerCase(), r.id]));
}

/** Cached — recomputed only when something in the project is edited. */
export const getPageTitleMap = cachedQuery(
  "pages:getPageTitleMap",
  uncachedGetPageTitleMap,
  (projectId: string) => [tags.pages(projectId)],
  CACHE_TTL.aggregate,
);


async function getContentHealthUncached(projectId: string) {
  const [row] = await db
    .select({
      total: count().mapWith(Number),
      thin: sql<number>`count(*) filter (where ${pages.wordCount} is not null and ${pages.wordCount} < 500)`.mapWith(
        Number,
      ),
      noFocus: sql<number>`count(*) filter (where ${pages.focusKeyword} is null)`.mapWith(
        Number,
      ),
      notIndexed: sql<number>`count(*) filter (where not ${pages.indexed})`.mapWith(
        Number,
      ),
      pending: sql<number>`count(*) filter (where not ${pages.onPageDone})`.mapWith(
        Number,
      ),
      noFaqs: sql<number>`count(*) filter (where not ${pages.hasFaqs})`.mapWith(Number),
      missingMeta: sql<number>`count(*) filter (where ${pages.metaDescription} is null)`.mapWith(
        Number,
      ),
    })
    .from(pages)
    .where(eq(pages.projectId, projectId));

  return (
    row ?? {
      total: 0,
      thin: 0,
      noFocus: 0,
      notIndexed: 0,
      pending: 0,
      noFaqs: 0,
      missingMeta: 0,
    }
  );
}

/** Content-health rollup for the on-page dashboard card. */
export const getContentHealth = cachedQuery(
  "pages:content-health",
  getContentHealthUncached,
  (projectId) => [tags.project(projectId), tags.pages(projectId)],
  CACHE_TTL.aggregate,
);
