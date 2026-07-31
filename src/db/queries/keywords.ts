import "server-only";

import {
  and,
  type AnyColumn,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { backlinks, keywords, pages, rankings } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import type { ListQuery } from "@/lib/query";
import { addMonths, currentMonthKey } from "@/lib/utils";

/**
 * Anchor-text ↔ keyword comparison, case- and whitespace-insensitive to match
 * the workbook's COUNTIFS semantics. Accepts either a keyword column (for a
 * join) or a literal string (for a single-keyword lookup).
 *
 * Backed by the `backlinks_anchor1_lower_idx` / `..._anchor2_lower_idx`
 * expression indexes, so this stays an index scan.
 */
function anchorMatches(keyword: AnyColumn | string) {
  // Drizzle interpolates a column as an identifier and a string as a bind
  // parameter, so one expression covers both the join and the lookup.
  const target = sql`lower(btrim(${keyword}))`;
  return or(
    sql`lower(btrim(${backlinks.anchorText1})) = ${target}`,
    sql`lower(btrim(${backlinks.anchorText2})) = ${target}`,
  );
}

export type KeywordRow = {
  id: string;
  keyword: string;
  intent: string | null;
  volume: number | null;
  kd: number | null;
  cpc: string | null;
  competition: number | null;
  ads: number | null;
  pageId: string | null;
  pageTitle: string | null;
  targetUrl: string | null;
  focusKeyword: string | null;
  priority: boolean;
  backlinkTarget: number;
  monthlyTarget: number | null;
  /** derived — see attachKeywordMetrics */
  linksPublished: number;
  linksIndexed: number;
  linksThisMonth: number;
  progress: number;
  currentPosition: number | null;
  currentPage: number | null;
  previousPosition: number | null;
  bestPosition: number | null;
};

const SORTABLE = {
  keyword: keywords.keyword,
  volume: keywords.volume,
  kd: keywords.kd,
  cpc: keywords.cpc,
  intent: keywords.intent,
  priority: keywords.priority,
  backlinkTarget: keywords.backlinkTarget,
  createdAt: keywords.createdAt,
  pageTitle: pages.title,
} as const;

function buildWhere(projectId: string, query: ListQuery) {
  const clauses: (SQL | undefined)[] = [eq(keywords.projectId, projectId)];
  const { q, filters } = query;

  if (q) {
    const like = `%${q}%`;
    clauses.push(
      or(
        ilike(keywords.keyword, like),
        ilike(pages.title, like),
        ilike(pages.targetUrl, like),
      ),
    );
  }
  if (filters.intent) clauses.push(eq(keywords.intent, filters.intent));
  if (filters.priority === "yes") clauses.push(eq(keywords.priority, true));
  if (filters.priority === "no") clauses.push(eq(keywords.priority, false));
  if (filters.page) {
    clauses.push(
      filters.page === "unmapped"
        ? isNull(keywords.pageId)
        : eq(keywords.pageId, filters.page),
    );
  }
  if (filters.minVolume) clauses.push(gte(keywords.volume, Number(filters.minVolume)));
  if (filters.maxKd) clauses.push(lte(keywords.kd, Number(filters.maxKd)));

  return and(...clauses.filter(Boolean));
}

async function uncachedListKeywords(
  projectId: string,
  query: ListQuery,
  options: { month?: string } = {},
) {
  const month = options.month ?? currentMonthKey();
  const where = buildWhere(projectId, query);
  const sortColumn = SORTABLE[query.sort as keyof typeof SORTABLE] ?? keywords.volume;
  // Most of these columns are nullable; push the blanks to the end either way.
  const orderExpr =
    query.dir === "asc"
      ? sql`${sortColumn} asc nulls last`
      : sql`${sortColumn} desc nulls last`;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: keywords.id,
        keyword: keywords.keyword,
        intent: keywords.intent,
        volume: keywords.volume,
        kd: keywords.kd,
        cpc: keywords.cpc,
        competition: keywords.competition,
        ads: keywords.ads,
        pageId: keywords.pageId,
        pageTitle: pages.title,
        targetUrl: pages.targetUrl,
        focusKeyword: pages.focusKeyword,
        priority: keywords.priority,
        backlinkTarget: keywords.backlinkTarget,
        monthlyTarget: keywords.monthlyTarget,
      })
      .from(keywords)
      .leftJoin(pages, eq(pages.id, keywords.pageId))
      .where(where)
      .orderBy(orderExpr, asc(keywords.keyword))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({
        total: count().mapWith(Number),
        priority: sql<number>`count(*) filter (where ${keywords.priority})`.mapWith(
          Number,
        ),
        totalVolume: sql<number>`coalesce(sum(${keywords.volume}), 0)`.mapWith(Number),
        avgKd: sql<number | null>`avg(${keywords.kd})`.mapWith(Number),
      })
      .from(keywords)
      .leftJoin(pages, eq(pages.id, keywords.pageId))
      .where(where),
  ]);

  const enriched = await attachKeywordMetrics(projectId, rows, month);

  return {
    rows: enriched,
    total: totals[0]?.total ?? 0,
    summary: {
      priority: totals[0]?.priority ?? 0,
      totalVolume: totals[0]?.totalVolume ?? 0,
      avgKd: totals[0]?.avgKd ?? null,
    },
  };
}

/**
 * Cached: the table itself is the slowest query on the page, and it only
 * changes when someone edits data — which always invalidates these tags.
 */
export const listKeywords = cachedQuery(
  "keywords:listKeywords",
  uncachedListKeywords,
  (projectId: string, _query: ListQuery, _options?: { month?: string }) => [
    tags.project(projectId),
  ],
  CACHE_TTL.aggregate,
);


/**
 * Replaces the sheet's COUNTIFS columns (N, O, P) and the VLOOKUP-driven
 * "Latest Ranking". Only the visible page of keywords is enriched, so the
 * anchor-text join stays small.
 */
export async function attachKeywordMetrics<
  T extends { id: string; keyword: string; backlinkTarget: number },
>(projectId: string, rows: T[], month: string) {
  if (!rows.length) return [] as (T & KeywordMetrics)[];

  const ids = rows.map((r) => r.id);
  const monthEnd = addMonths(month, 1);
  const prevMonth = addMonths(month, -1);

  const [linkCounts, currentRanks, prevRanks, bestRanks] = await Promise.all([
    // Anchor text on either slot counts as a link to that keyword — this is
    // exactly what the sheet's SUM(COUNTIFS(...E...), COUNTIFS(...F...)) did.
    db
      .select({
        keywordId: keywords.id,
        published: sql<number>`count(${backlinks.id}) filter (where ${backlinks.status} = 'Published')`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(${backlinks.id}) filter (where ${backlinks.indexed})`.mapWith(
          Number,
        ),
        thisMonth: sql<number>`count(${backlinks.id}) filter (
          where ${backlinks.status} = 'Published'
            and ${backlinks.publishedDate} >= ${month}
            and ${backlinks.publishedDate} < ${monthEnd}
        )`.mapWith(Number),
      })
      .from(keywords)
      .leftJoin(
        backlinks,
        and(
          eq(backlinks.projectId, keywords.projectId),
          // Excel's COUNTIFS ignores case and surrounding spaces, and the
          // workbook relies on that — "SEO Services in Canada" as an anchor is
          // meant to count towards the keyword "seo services in canada".
          // Matching exactly here silently dropped 491 links.
          anchorMatches(keywords.keyword),
        ),
      )
      .where(and(eq(keywords.projectId, projectId), inArray(keywords.id, ids)))
      .groupBy(keywords.id),

    db
      .select({
        keywordId: rankings.keywordId,
        position: rankings.position,
        page: rankings.page,
      })
      .from(rankings)
      .where(and(inArray(rankings.keywordId, ids), eq(rankings.month, month))),

    db
      .select({ keywordId: rankings.keywordId, position: rankings.position })
      .from(rankings)
      .where(and(inArray(rankings.keywordId, ids), eq(rankings.month, prevMonth))),

    db
      .select({
        keywordId: rankings.keywordId,
        best: sql<number | null>`min(${rankings.position})`.mapWith(Number),
      })
      .from(rankings)
      .where(and(inArray(rankings.keywordId, ids), isNotNull(rankings.position)))
      .groupBy(rankings.keywordId),
  ]);

  const links = new Map(linkCounts.map((r) => [r.keywordId, r]));
  const current = new Map(currentRanks.map((r) => [r.keywordId, r]));
  const previous = new Map(prevRanks.map((r) => [r.keywordId, r.position]));
  const best = new Map(bestRanks.map((r) => [r.keywordId, r.best]));

  return rows.map((row) => {
    const l = links.get(row.id);
    const published = l?.published ?? 0;
    const indexed = l?.indexed ?? 0;
    const cur = current.get(row.id);
    return {
      ...row,
      linksPublished: published,
      linksIndexed: indexed,
      linksThisMonth: l?.thisMonth ?? 0,
      // Sheet "Keyword Analysis" column E: =If(C=0,0,D/C)*100, where D counts
      // INDEXED links. A published link Google has not indexed does no work
      // yet, so progress deliberately tracks the indexed count.
      progress: row.backlinkTarget
        ? Math.min(100, (indexed / row.backlinkTarget) * 100)
        : 0,
      currentPosition: cur?.position ?? null,
      currentPage: cur?.page ?? null,
      previousPosition: previous.get(row.id) ?? null,
      bestPosition: best.get(row.id) ?? null,
    };
  });
}

export type KeywordMetrics = {
  linksPublished: number;
  linksIndexed: number;
  linksThisMonth: number;
  progress: number;
  currentPosition: number | null;
  currentPage: number | null;
  previousPosition: number | null;
  bestPosition: number | null;
};

export async function getKeyword(projectId: string, id: string) {
  const [row] = await db
    .select({
      id: keywords.id,
      keyword: keywords.keyword,
      intent: keywords.intent,
      volume: keywords.volume,
      kd: keywords.kd,
      cpc: keywords.cpc,
      competition: keywords.competition,
      ads: keywords.ads,
      pageId: keywords.pageId,
      pageTitle: pages.title,
      targetUrl: pages.targetUrl,
      focusKeyword: pages.focusKeyword,
      priority: keywords.priority,
      backlinkTarget: keywords.backlinkTarget,
      monthlyTarget: keywords.monthlyTarget,
    })
    .from(keywords)
    .leftJoin(pages, eq(pages.id, keywords.pageId))
    .where(and(eq(keywords.projectId, projectId), eq(keywords.id, id)))
    .limit(1);
  return row ?? null;
}

/** Full rank history for one keyword — powers the detail chart. */
export async function getKeywordHistory(keywordId: string) {
  return db
    .select({
      month: rankings.month,
      page: rankings.page,
      position: rankings.position,
      checkedOn: rankings.checkedOn,
    })
    .from(rankings)
    .where(eq(rankings.keywordId, keywordId))
    .orderBy(asc(rankings.month));
}

/** Backlinks whose anchor text matches this keyword. */
export async function getKeywordBacklinks(projectId: string, keyword: string) {
  return db
    .select({
      id: backlinks.id,
      url: backlinks.url,
      type: backlinks.type,
      status: backlinks.status,
      indexed: backlinks.indexed,
      publishedDate: backlinks.publishedDate,
      da: backlinks.da,
      anchorText1: backlinks.anchorText1,
      anchorText2: backlinks.anchorText2,
    })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.projectId, projectId),
        anchorMatches(keyword),
      ),
    )
    .orderBy(desc(backlinks.publishedDate))
    .limit(100);
}

/** Options for the "map to page" select. */
async function uncachedGetPageOptions(projectId: string) {
  return db
    .select({ id: pages.id, title: pages.title, type: pages.type })
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .orderBy(asc(pages.title));
}

export const getPageOptions = cachedQuery(
  "keywords:get-page-options",
  uncachedGetPageOptions,
  (projectId) => [tags.project(projectId), tags.pages(projectId)],
  CACHE_TTL.reference,
);

export async function getKeywordIdsByName(projectId: string, names: string[]) {
  if (!names.length) return new Map<string, string>();
  const rows = await db
    .select({ id: keywords.id, keyword: keywords.keyword })
    .from(keywords)
    .where(
      and(
        eq(keywords.projectId, projectId),
        sql`lower(${keywords.keyword}) = any(${sql.param(
          names.map((n) => n.toLowerCase()),
        )}::text[])`,
      ),
    );
  return new Map(rows.map((r) => [r.keyword.toLowerCase(), r.id]));
}

/** Keywords with the biggest month-over-month movement, both directions. */
async function uncachedGetRankMovers(
  projectId: string,
  month: string,
  limit = 8,
) {
  const prev = addMonths(month, -1);
  const rows = await db
    .select({
      id: keywords.id,
      keyword: keywords.keyword,
      volume: keywords.volume,
      current: sql<number>`cur.position`.mapWith(Number),
      previous: sql<number>`prev.position`.mapWith(Number),
      delta: sql<number>`prev.position - cur.position`.mapWith(Number),
    })
    .from(keywords)
    .innerJoin(
      sql`${rankings} as cur`,
      sql`cur.keyword_id = ${keywords.id} and cur.month = ${month} and cur.position is not null`,
    )
    .innerJoin(
      sql`${rankings} as prev`,
      sql`prev.keyword_id = ${keywords.id} and prev.month = ${prev} and prev.position is not null`,
    )
    .where(eq(keywords.projectId, projectId))
    .orderBy(sql`abs(prev.position - cur.position) desc`)
    .limit(limit * 2);

  return {
    gainers: rows.filter((r) => r.delta > 0).slice(0, limit),
    losers: rows
      .filter((r) => r.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, limit),
  };
}

export const getRankMovers = cachedQuery(
  "keywords:get-rank-movers",
  uncachedGetRankMovers,
  (projectId) => [
    tags.project(projectId),
    tags.rankings(projectId),
    // Rows carry the keyword name and volume, so a keyword edit or a
    // newly added keyword changes this list too.
    tags.keywords(projectId),
  ],
  CACHE_TTL.aggregate,
);
