import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { keywords, pages, rankings } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { addMonths, monthLabel } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   The "Keyword Analysis" sheet was 16 month-columns wide and grew a
   new pair of columns every month. Here it is one row per
   (keyword, month) and the grid is pivoted at read time.
   ════════════════════════════════════════════════════════════════ */

export type RankMatrixRow = {
  keywordId: string;
  keyword: string;
  volume: number | null;
  priority: boolean;
  pageTitle: string | null;
  backlinkTarget: number;
  /** month key → { page, position } */
  cells: Record<string, { page: number | null; position: number | null }>;
  current: number | null;
  previous: number | null;
  best: number | null;
  delta: number | null;
};

async function getRankMonthsUncached(projectId: string) {
  const rows = await db
    .selectDistinct({ month: rankings.month })
    .from(rankings)
    .where(eq(rankings.projectId, projectId))
    .orderBy(asc(rankings.month));
  return rows.map((r) => r.month);
}

/** Distinct months present in the rank data, oldest first. */
export const getRankMonths = cachedQuery(
  "rankings:rank-months",
  getRankMonthsUncached,
  (projectId) => [tags.project(projectId), tags.rankings(projectId)],
  CACHE_TTL.reference,
);

/* Deliberately uncached: the matrix takes a free-text `q` plus sort/dir and
   pagination, so its filter combinations are unbounded. */
async function uncachedGetRankMatrix(
  projectId: string,
  options: {
    months?: string[];
    /** how many trailing months to show */
    window?: number;
    q?: string;
    priorityOnly?: boolean;
    pageId?: string;
    page?: number;
    pageSize?: number;
    sort?: "current" | "delta" | "volume" | "keyword";
    dir?: "asc" | "desc";
  } = {},
) {
  const {
    window = 12,
    q,
    priorityOnly,
    pageId,
    page = 1,
    pageSize = 50,
    sort = "current",
    dir = "asc",
  } = options;

  const allMonths = options.months ?? (await getRankMonths(projectId));
  const months = allMonths.slice(-window);
  const latest = months[months.length - 1];
  const previous = months[months.length - 2];

  const clauses = [eq(keywords.projectId, projectId)];
  if (q) {
    const like = `%${q}%`;
    clauses.push(or(ilike(keywords.keyword, like), ilike(pages.title, like))!);
  }
  if (priorityOnly) clauses.push(eq(keywords.priority, true));
  if (pageId) clauses.push(eq(keywords.pageId, pageId));
  const where = and(...clauses);

  // Sort on the latest month's position so the grid opens on best performers.
  const orderExpr =
    sort === "keyword"
      ? sql`${keywords.keyword} ${sql.raw(dir)}`
      : sort === "volume"
        ? sql`${keywords.volume} ${sql.raw(dir)} nulls last`
        : sort === "delta"
          ? sql`(prev.position - cur.position) ${sql.raw(dir)} nulls last`
          : sql`cur.position ${sql.raw(dir)} nulls last`;

  const [rows, totals] = await Promise.all([
    db
      .select({
        keywordId: keywords.id,
        keyword: keywords.keyword,
        volume: keywords.volume,
        priority: keywords.priority,
        pageTitle: pages.title,
        backlinkTarget: keywords.backlinkTarget,
        current: sql<number | null>`cur.position`.mapWith(Number),
        currentPage: sql<number | null>`cur.page`.mapWith(Number),
        previous: sql<number | null>`prev.position`.mapWith(Number),
      })
      .from(keywords)
      .leftJoin(pages, eq(pages.id, keywords.pageId))
      .leftJoin(
        sql`${rankings} as cur`,
        sql`cur.keyword_id = ${keywords.id} and cur.month = ${latest ?? null}`,
      )
      .leftJoin(
        sql`${rankings} as prev`,
        sql`prev.keyword_id = ${keywords.id} and prev.month = ${previous ?? null}`,
      )
      .where(where)
      .orderBy(orderExpr, asc(keywords.keyword))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count().mapWith(Number) })
      .from(keywords)
      .leftJoin(pages, eq(pages.id, keywords.pageId))
      .where(where),
  ]);

  const ids = rows.map((r) => r.keywordId);
  const cells = ids.length
    ? await db
        .select({
          keywordId: rankings.keywordId,
          month: rankings.month,
          page: rankings.page,
          position: rankings.position,
        })
        .from(rankings)
        .where(
          and(
            inArray(rankings.keywordId, ids),
            months.length ? inArray(rankings.month, months) : sql`false`,
          ),
        )
    : [];

  const bests = ids.length
    ? await db
        .select({
          keywordId: rankings.keywordId,
          best: sql<number | null>`min(${rankings.position})`.mapWith(Number),
        })
        .from(rankings)
        .where(and(inArray(rankings.keywordId, ids), isNotNull(rankings.position)))
        .groupBy(rankings.keywordId)
    : [];

  const cellMap = new Map<string, RankMatrixRow["cells"]>();
  for (const c of cells) {
    const bucket = cellMap.get(c.keywordId) ?? {};
    bucket[c.month] = { page: c.page, position: c.position };
    cellMap.set(c.keywordId, bucket);
  }
  const bestMap = new Map(bests.map((b) => [b.keywordId, b.best]));

  const matrix: RankMatrixRow[] = rows.map((r) => ({
    keywordId: r.keywordId,
    keyword: r.keyword,
    volume: r.volume,
    priority: r.priority,
    pageTitle: r.pageTitle,
    backlinkTarget: r.backlinkTarget,
    cells: cellMap.get(r.keywordId) ?? {},
    current: r.current,
    previous: r.previous,
    best: bestMap.get(r.keywordId) ?? null,
    delta:
      r.current != null && r.previous != null ? r.previous - r.current : null,
  }));

  return {
    months,
    monthLabels: months.map((m) => ({ month: m, label: monthLabel(m) })),
    latest,
    previous,
    rows: matrix,
    total: totals[0]?.total ?? 0,
  };
}

/** Cached — recomputed only when something in the project is edited. */
export const getRankMatrix = cachedQuery(
  "rankings:getRankMatrix",
  uncachedGetRankMatrix,
  (projectId: string, ..._rest: unknown[]) => [tags.project(projectId)],
  CACHE_TTL.aggregate,
);


async function getMonthSummaryUncached(projectId: string, month: string) {
  const prev = addMonths(month, -1);
  const [current, previous] = await Promise.all([
    db
      .select({
        tracked: count().mapWith(Number),
        avgPosition: sql<number | null>`avg(${rankings.position})`.mapWith(Number),
        top3: sql<number>`count(*) filter (where ${rankings.position} <= 3)`.mapWith(
          Number,
        ),
        top10: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
          Number,
        ),
        top20: sql<number>`count(*) filter (where ${rankings.position} <= 20)`.mapWith(
          Number,
        ),
      })
      .from(rankings)
      .where(
        and(
          eq(rankings.projectId, projectId),
          eq(rankings.month, month),
          isNotNull(rankings.position),
        ),
      ),
    db
      .select({
        tracked: count().mapWith(Number),
        avgPosition: sql<number | null>`avg(${rankings.position})`.mapWith(Number),
        top3: sql<number>`count(*) filter (where ${rankings.position} <= 3)`.mapWith(
          Number,
        ),
        top10: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
          Number,
        ),
      })
      .from(rankings)
      .where(
        and(
          eq(rankings.projectId, projectId),
          eq(rankings.month, prev),
          isNotNull(rankings.position),
        ),
      ),
  ]);

  const c = current[0] ?? { tracked: 0, avgPosition: null, top3: 0, top10: 0, top20: 0 };
  const p = previous[0] ?? { tracked: 0, avgPosition: null, top3: 0, top10: 0 };

  return {
    month,
    label: monthLabel(month),
    tracked: c.tracked,
    avgPosition: c.avgPosition,
    top3: c.top3,
    top10: c.top10,
    top20: c.top20 ?? 0,
    deltas: {
      // Lower average position is better, so invert for display.
      avgPosition:
        c.avgPosition != null && p.avgPosition != null
          ? p.avgPosition - c.avgPosition
          : null,
      top3: c.top3 - p.top3,
      top10: c.top10 - p.top10,
      tracked: c.tracked - p.tracked,
    },
  };
}

/** Snapshot summary for one month — used by the month header strip. */
export const getMonthSummary = cachedQuery(
  "rankings:month-summary",
  getMonthSummaryUncached,
  (projectId) => [tags.project(projectId), tags.rankings(projectId)],
);

/** Every keyword with its position for one month — the bulk-entry grid.
 *  Uncached: this is the surface being edited, so it must read through. */
async function uncachedGetMonthEntryRows(projectId: string, month: string) {
  return db
    .select({
      keywordId: keywords.id,
      keyword: keywords.keyword,
      volume: keywords.volume,
      priority: keywords.priority,
      pageTitle: pages.title,
      position: sql<number | null>`r.position`.mapWith(Number),
      page: sql<number | null>`r.page`.mapWith(Number),
      checkedOn: sql<string | null>`r.checked_on`,
      previous: sql<number | null>`p.position`.mapWith(Number),
    })
    .from(keywords)
    .leftJoin(pages, eq(pages.id, keywords.pageId))
    .leftJoin(
      sql`${rankings} as r`,
      sql`r.keyword_id = ${keywords.id} and r.month = ${month}`,
    )
    .leftJoin(
      sql`${rankings} as p`,
      sql`p.keyword_id = ${keywords.id} and p.month = ${addMonths(month, -1)}`,
    )
    .where(eq(keywords.projectId, projectId))
    .orderBy(desc(keywords.priority), sql`r.position asc nulls last`, asc(keywords.keyword));
}

/** Cached — recomputed only when something in the project is edited. */
export const getMonthEntryRows = cachedQuery(
  "rankings:getMonthEntryRows",
  uncachedGetMonthEntryRows,
  (projectId: string, _month: string) => [tags.project(projectId)],
  CACHE_TTL.aggregate,
);

