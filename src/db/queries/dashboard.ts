import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  analyticsSnapshots,
  backlinks,
  keywords,
  pages,
  rankings,
} from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { TRACKED_SERP_PAGES } from "@/lib/constants";
import {
  addMonths,
  currentMonthKey,
  monthKey,
  monthLabel,
  deltaPercent,
  percentOf,
  ratio,
} from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   Everything the "Dashboard" sheet computed with COUNTIF/COUNTIFS,
   expressed as grouped SQL instead.
   ════════════════════════════════════════════════════════════════ */

export type LabelledCount = { label: string; value: number };

async function getBacklinksByTypeUncached(projectId: string) {
  const rows = await db
    .select({
      label: backlinks.type,
      value: count().mapWith(Number),
    })
    .from(backlinks)
    .where(eq(backlinks.projectId, projectId))
    .groupBy(backlinks.type)
    .orderBy(desc(count()));
  return rows as LabelledCount[];
}

/** Sheet A2:B14 — total links per link type. */
export const getBacklinksByType = cachedQuery(
  "dashboard:backlinks-by-type",
  getBacklinksByTypeUncached,
  (projectId) => [tags.project(projectId), tags.backlinks(projectId)],
);

async function getBacklinksByMonthUncached(projectId: string) {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${backlinks.publishedDate}), 'YYYY-MM-DD')`,
      value: count().mapWith(Number),
      indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(
        Number,
      ),
    })
    .from(backlinks)
    .where(
      and(eq(backlinks.projectId, projectId), isNotNull(backlinks.publishedDate)),
    )
    .groupBy(sql`date_trunc('month', ${backlinks.publishedDate})`)
    .orderBy(asc(sql`date_trunc('month', ${backlinks.publishedDate})`));

  return rows.map((r) => ({
    month: r.month,
    label: monthLabel(r.month),
    value: r.value,
    indexed: r.indexed,
  }));
}

/** Sheet D2:E28 — links published per calendar month. */
export const getBacklinksByMonth = cachedQuery(
  "dashboard:backlinks-by-month",
  getBacklinksByMonthUncached,
  (projectId) => [tags.project(projectId), tags.backlinks(projectId)],
);

async function getBacklinksByTypeForMonthUncached(projectId: string, month: string) {
  const monthEnd = addMonths(month, 1);
  const rows = await db
    .select({
      label: backlinks.type,
      value: count().mapWith(Number),
    })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.projectId, projectId),
        gte(backlinks.publishedDate, month),
        sql`${backlinks.publishedDate} < ${monthEnd}`,
      ),
    )
    .groupBy(backlinks.type)
    .orderBy(desc(count()));
  return rows as LabelledCount[];
}

/** Sheet G2:H14 — the current month broken down by link type. */
export const getBacklinksByTypeForMonth = cachedQuery(
  "dashboard:backlinks-by-type-for-month",
  getBacklinksByTypeForMonthUncached,
  (projectId) => [tags.project(projectId), tags.backlinks(projectId)],
);

async function getRankDistributionUncached(projectId: string, month: string) {
  const rows = await db
    .select({
      page: rankings.page,
      value: count().mapWith(Number),
    })
    .from(rankings)
    .where(
      and(
        eq(rankings.projectId, projectId),
        eq(rankings.month, month),
        isNotNull(rankings.page),
      ),
    )
    .groupBy(rankings.page)
    .orderBy(asc(rankings.page));

  const byPage = new Map(rows.map((r) => [Math.round(r.page ?? 0), r.value]));
  const tracked: { label: string; page: number; value: number }[] =
    TRACKED_SERP_PAGES.map((p) => ({
      label: `Page ${p}`,
      page: p as number,
      value: byPage.get(p) ?? 0,
    }));
  const beyond = rows
    .filter((r) => Math.round(r.page ?? 0) > 5)
    .reduce((acc, r) => acc + r.value, 0);
  if (beyond > 0) {
    tracked.push({ label: "Page 6+", page: 6, value: beyond });
  }
  return tracked;
}

/** Sheet G16:H22 — how many keywords sit on SERP page 1…5 in a given month. */
export const getRankDistribution = cachedQuery(
  "dashboard:rank-distribution",
  getRankDistributionUncached,
  (projectId) => [tags.project(projectId), tags.rankings(projectId)],
);

/* ── Headline KPIs ─────────────────────────────────────────────── */

export type ProjectKpis = {
  month: string;
  monthLabel: string;
  backlinks: {
    total: number;
    published: number;
    indexed: number;
    pending: number;
    thisMonth: number;
    lastMonth: number;
    indexRate: number;
    /** null when there is no previous month to compare against. */
    monthDelta: number | null;
    avgDa: number | null;
    avgSpam: number | null;
  };
  keywords: {
    total: number;
    tracked: number;
    priority: number;
    page1: number;
    top3: number;
    top10: number;
    improved: number;
    declined: number;
    avgPosition: number | null;
    avgPositionPrev: number | null;
  };
  pages: {
    total: number;
    optimised: number;
    indexed: number;
    withFaqs: number;
    avgWordCount: number | null;
  };
  search: {
    clicks: number;
    impressions: number;
    ctr: number;
    gaTraffic: number;
    /** null when there is no previous month to compare against. */
    clicksDelta: number | null;
    /** null when there is no previous month to compare against. */
    impressionsDelta: number | null;
    /** null when there is no previous month to compare against. */
    trafficDelta: number | null;
  };
};

async function getProjectKpisUncached(
  projectId: string,
  month = currentMonthKey(),
): Promise<ProjectKpis> {
  const prevMonth = addMonths(month, -1);
  const monthEnd = addMonths(month, 1);

  const [
    backlinkAgg,
    monthAgg,
    prevMonthAgg,
    keywordAgg,
    pageAgg,
    rankAgg,
    prevRankAgg,
    analyticsRows,
  ] = await Promise.all([
    // ── backlinks, all time
    db
      .select({
        total: count().mapWith(Number),
        published: sql<number>`count(*) filter (where ${backlinks.status} = 'Published')`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(
          Number,
        ),
        pending: sql<number>`count(*) filter (where ${backlinks.status} = 'Pending')`.mapWith(
          Number,
        ),
        avgDa: sql<number | null>`avg(${backlinks.da})`.mapWith(Number),
        avgSpam: sql<number | null>`avg(${backlinks.spamScore})`.mapWith(Number),
      })
      .from(backlinks)
      .where(eq(backlinks.projectId, projectId)),

    // ── backlinks, this month
    db
      .select({ value: count().mapWith(Number) })
      .from(backlinks)
      .where(
        and(
          eq(backlinks.projectId, projectId),
          gte(backlinks.publishedDate, month),
          sql`${backlinks.publishedDate} < ${monthEnd}`,
        ),
      ),

    // ── backlinks, previous month
    db
      .select({ value: count().mapWith(Number) })
      .from(backlinks)
      .where(
        and(
          eq(backlinks.projectId, projectId),
          gte(backlinks.publishedDate, prevMonth),
          sql`${backlinks.publishedDate} < ${month}`,
        ),
      ),

    // ── keywords
    db
      .select({
        total: count().mapWith(Number),
        priority: sql<number>`count(*) filter (where ${keywords.priority})`.mapWith(
          Number,
        ),
      })
      .from(keywords)
      .where(eq(keywords.projectId, projectId)),

    // ── pages
    db
      .select({
        total: count().mapWith(Number),
        optimised: sql<number>`count(*) filter (where ${pages.onPageDone})`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${pages.indexed})`.mapWith(Number),
        withFaqs: sql<number>`count(*) filter (where ${pages.hasFaqs})`.mapWith(Number),
        avgWordCount: sql<number | null>`avg(${pages.wordCount})`.mapWith(Number),
      })
      .from(pages)
      .where(eq(pages.projectId, projectId)),

    // ── rankings this month
    db
      .select({
        tracked: count().mapWith(Number),
        page1: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
          Number,
        ),
        top3: sql<number>`count(*) filter (where ${rankings.position} <= 3)`.mapWith(
          Number,
        ),
        avgPosition: sql<number | null>`avg(${rankings.position})`.mapWith(Number),
      })
      .from(rankings)
      .where(
        and(
          eq(rankings.projectId, projectId),
          eq(rankings.month, month),
          isNotNull(rankings.position),
        ),
      ),

    // ── rankings previous month (for the delta)
    db
      .select({
        avgPosition: sql<number | null>`avg(${rankings.position})`.mapWith(Number),
      })
      .from(rankings)
      .where(
        and(
          eq(rankings.projectId, projectId),
          eq(rankings.month, prevMonth),
          isNotNull(rankings.position),
        ),
      ),

    // ── search console, this month + previous
    db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.projectId, projectId),
          gte(analyticsSnapshots.month, prevMonth),
          lte(analyticsSnapshots.month, month),
        ),
      )
      .orderBy(asc(analyticsSnapshots.month)),
  ]);

  // Uncached: the KPI entry already carries the rankings tag, so a second
  // cache entry would only add a way for the two halves to disagree.
  const movement = await getRankMovementUncached(projectId, month);

  const b = backlinkAgg[0] ?? {
    total: 0,
    published: 0,
    indexed: 0,
    pending: 0,
    avgDa: null,
    avgSpam: null,
  };
  const k = keywordAgg[0] ?? { total: 0, priority: 0 };
  const p = pageAgg[0] ?? {
    total: 0,
    optimised: 0,
    indexed: 0,
    withFaqs: 0,
    avgWordCount: null,
  };
  const r = rankAgg[0] ?? { tracked: 0, page1: 0, top3: 0, avgPosition: null };

  const thisMonthLinks = monthAgg[0]?.value ?? 0;
  const lastMonthLinks = prevMonthAgg[0]?.value ?? 0;

  const currentAnalytics = analyticsRows.find((a) => a.month === month);
  const prevAnalytics = analyticsRows.find((a) => a.month === prevMonth);

  const clicks = currentAnalytics?.clicks ?? 0;
  const impressions = currentAnalytics?.impressions ?? 0;
  const gaTraffic = currentAnalytics?.gaTraffic ?? 0;

  return {
    month,
    monthLabel: monthLabel(month),
    backlinks: {
      total: b.total,
      published: b.published,
      indexed: b.indexed,
      pending: b.pending,
      thisMonth: thisMonthLinks,
      lastMonth: lastMonthLinks,
      indexRate: percentOf(b.indexed, b.total),
      monthDelta: deltaPercent(thisMonthLinks, lastMonthLinks),
      avgDa: b.avgDa ?? null,
      avgSpam: b.avgSpam ?? null,
    },
    keywords: {
      total: k.total,
      tracked: r.tracked,
      priority: k.priority,
      page1: r.page1,
      top3: r.top3,
      top10: r.page1,
      improved: movement.improved,
      declined: movement.declined,
      avgPosition: r.avgPosition ?? null,
      avgPositionPrev: prevRankAgg[0]?.avgPosition ?? null,
    },
    pages: {
      total: p.total,
      optimised: p.optimised,
      indexed: p.indexed,
      withFaqs: p.withFaqs,
      avgWordCount: p.avgWordCount ?? null,
    },
    search: {
      clicks,
      impressions,
      ctr: percentOf(clicks, impressions),
      gaTraffic,
      clicksDelta: deltaPercent(clicks, prevAnalytics?.clicks),
      impressionsDelta: deltaPercent(impressions, prevAnalytics?.impressions),
      trafficDelta: deltaPercent(gaTraffic, prevAnalytics?.gaTraffic),
    },
  };
}

export const getProjectKpis = cachedQuery(
  "dashboard:project-kpis",
  getProjectKpisUncached,
  // `_month` is unused but must be declared: `Args` is inferred from both the
  // query and this callback, so a one-parameter callback would collapse the
  // public signature to `(projectId)` and drop the optional month.
  (projectId: string, _month?: string) => [
    tags.project(projectId),
    tags.rankings(projectId),
    tags.backlinks(projectId),
    tags.keywords(projectId),
    tags.pages(projectId),
    tags.analytics(projectId),
  ],
);

async function getRankMovementUncached(projectId: string, month: string) {
  const prev = addMonths(month, -1);
  const rows = await db
    .select({
      improved: sql<number>`count(*) filter (where cur.position < prev.position)`.mapWith(
        Number,
      ),
      declined: sql<number>`count(*) filter (where cur.position > prev.position)`.mapWith(
        Number,
      ),
      held: sql<number>`count(*) filter (where cur.position = prev.position)`.mapWith(
        Number,
      ),
    })
    .from(sql`${rankings} as cur`)
    .innerJoin(
      sql`${rankings} as prev`,
      sql`prev.keyword_id = cur.keyword_id and prev.month = ${prev}`,
    )
    .where(
      sql`cur.project_id = ${projectId} and cur.month = ${month}
          and cur.position is not null and prev.position is not null`,
    );
  return rows[0] ?? { improved: 0, declined: 0, held: 0 };
}

/** How many keywords gained vs lost ground month over month. */
export const getRankMovement = cachedQuery(
  "dashboard:rank-movement",
  getRankMovementUncached,
  (projectId) => [tags.project(projectId), tags.rankings(projectId)],
);

/* ── Trend series for the dashboard charts ─────────────────────── */

export type TrendPoint = {
  month: string;
  label: string;
  clicks: number;
  impressions: number;
  traffic: number;
  ctr: number;
  keywords: number | null;
};

async function getSearchTrendUncached(projectId: string, months = 18) {
  const rows = await db
    .select()
    .from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.projectId, projectId))
    .orderBy(asc(analyticsSnapshots.month));

  return rows.slice(-months).map<TrendPoint>((r) => ({
    month: r.month,
    label: monthLabel(r.month),
    clicks: r.clicks,
    impressions: r.impressions,
    traffic: r.gaTraffic ?? 0,
    ctr: percentOf(r.clicks, r.impressions),
    keywords: r.keywordCount,
  }));
}

export const getSearchTrend = cachedQuery(
  "dashboard:search-trend",
  getSearchTrendUncached,
  (projectId: string, _months?: number) => [
    tags.project(projectId),
    tags.analytics(projectId),
  ],
);

async function getAveragePositionTrendUncached(projectId: string, months = 18) {
  const rows = await db
    .select({
      month: rankings.month,
      avgPosition: sql<number>`avg(${rankings.position})`.mapWith(Number),
      tracked: count().mapWith(Number),
      page1: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
        Number,
      ),
      top3: sql<number>`count(*) filter (where ${rankings.position} <= 3)`.mapWith(
        Number,
      ),
    })
    .from(rankings)
    .where(and(eq(rankings.projectId, projectId), isNotNull(rankings.position)))
    .groupBy(rankings.month)
    .orderBy(asc(rankings.month));

  return rows.slice(-months).map((r) => ({
    month: r.month,
    label: monthLabel(r.month),
    position: r.avgPosition ? Number(r.avgPosition.toFixed(1)) : null,
    tracked: r.tracked,
    page1: r.page1,
    top3: r.top3,
  }));
}

/** Average tracked position per month — the client-facing progress line. */
export const getAveragePositionTrend = cachedQuery(
  "dashboard:average-position-trend",
  getAveragePositionTrendUncached,
  (projectId: string, _months?: number) => [
    tags.project(projectId),
    tags.rankings(projectId),
  ],
);

async function getLatestDataMonthUncached(
  projectIds: string[] | null,
): Promise<string> {
  const scopeRank = projectIds
    ? inArray(rankings.projectId, projectIds)
    : undefined;
  const scopeLinks = projectIds
    ? inArray(backlinks.projectId, projectIds)
    : undefined;
  const scopeAnalytics = projectIds
    ? inArray(analyticsSnapshots.projectId, projectIds)
    : undefined;

  if (projectIds && projectIds.length === 0) return currentMonthKey();

  const [rank, link, analytic] = await Promise.all([
    db
      .select({ month: sql<string | null>`max(${rankings.month})::text` })
      .from(rankings)
      .where(scopeRank),
    db
      .select({
        month: sql<string | null>`to_char(date_trunc('month', max(${backlinks.publishedDate})), 'YYYY-MM-DD')`,
      })
      .from(backlinks)
      .where(scopeLinks),
    db
      .select({ month: sql<string | null>`max(${analyticsSnapshots.month})::text` })
      .from(analyticsSnapshots)
      .where(scopeAnalytics),
  ]);

  const candidates = [rank[0]?.month, link[0]?.month, analytic[0]?.month].filter(
    (m): m is string => Boolean(m),
  );

  if (!candidates.length) return currentMonthKey();

  // Never report a future month, even if someone recorded one by mistake.
  const now = currentMonthKey();
  const usable = candidates.filter((m) => m <= now);
  const newest = (usable.length ? usable : candidates).sort((a, b) =>
    b.localeCompare(a),
  )[0];

  return monthKey(newest);
}

/**
 * The newest month that actually holds data across the given projects.
 *
 * Without this, a dashboard opened in July shows zeros for a campaign whose
 * latest recorded month is June — technically correct, but it reads as broken.
 * Falls back to the calendar month when there is no data at all.
 */
export const getLatestDataMonth = cachedQuery(
  "dashboard:latest-data-month",
  getLatestDataMonthUncached,
  (projectIds) => [
    // `null` scopes the query to every project, and there is no tag for that —
    // but every invalidate() revalidates the list tag, so it covers both cases.
    tags.projectList(),
    ...(projectIds ?? []).flatMap((id) => [
      tags.project(id),
      tags.rankings(id),
      tags.backlinks(id),
      tags.analytics(id),
    ]),
  ],
  CACHE_TTL.rollup,
);

async function getAvailableMonthsUncached(projectId: string) {
  const [rankMonths, linkMonths, analyticsMonths] = await Promise.all([
    db
      .selectDistinct({ month: rankings.month })
      .from(rankings)
      .where(eq(rankings.projectId, projectId)),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${backlinks.publishedDate}), 'YYYY-MM-DD')`,
      })
      .from(backlinks)
      .where(
        and(eq(backlinks.projectId, projectId), isNotNull(backlinks.publishedDate)),
      )
      .groupBy(sql`date_trunc('month', ${backlinks.publishedDate})`),
    db
      .selectDistinct({ month: analyticsSnapshots.month })
      .from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.projectId, projectId)),
  ]);

  const set = new Set<string>([
    ...rankMonths.map((m) => m.month),
    ...linkMonths.map((m) => m.month),
    ...analyticsMonths.map((m) => m.month),
    currentMonthKey(),
  ]);

  return Array.from(set)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Resolves which month a report should open on.
 *
 * The picker deliberately offers the current calendar month so the team can
 * enter data for it, but that month is usually empty — defaulting to it shows
 * the client a wall of zeros. So the options and the default are decided
 * separately: options include "now", the default is the newest month that
 * actually holds data.
 *
 * An explicit `?month=` wins, as long as it is a real option.
 */
export async function resolveReportMonth(
  projectId: string,
  requested?: string,
): Promise<{ month: string; months: string[] }> {
  const [months, latest] = await Promise.all([
    getAvailableMonths(projectId),
    getLatestDataMonth([projectId]),
  ]);

  const month =
    requested && months.includes(requested)
      ? requested
      : months.includes(latest)
        ? latest
        : (months[0] ?? currentMonthKey());

  return { month, months };
}

/** Every month that has data, newest first — powers the month pickers. */
export const getAvailableMonths = cachedQuery(
  "dashboard:available-months",
  getAvailableMonthsUncached,
  (projectId) => [
    tags.project(projectId),
    tags.rankings(projectId),
    tags.backlinks(projectId),
    tags.analytics(projectId),
  ],
  CACHE_TTL.reference,
);

/* ── Anchor-text distribution (new — the sheet had no view for this) ── */

async function getAnchorDistributionUncached(projectId: string, limit = 12) {
  const rows = await db
    .select({
      label: sql<string>`anchor`,
      value: count().mapWith(Number),
    })
    .from(
      sql`(
        select ${backlinks.anchorText1} as anchor from ${backlinks}
          where ${backlinks.projectId} = ${projectId} and ${backlinks.anchorText1} is not null
        union all
        select ${backlinks.anchorText2} as anchor from ${backlinks}
          where ${backlinks.projectId} = ${projectId} and ${backlinks.anchorText2} is not null
      ) as anchors`,
    )
    .groupBy(sql`anchor`)
    .orderBy(desc(count()))
    .limit(limit);
  return rows as LabelledCount[];
}

export const getAnchorDistribution = cachedQuery(
  "dashboard:anchor-distribution",
  getAnchorDistributionUncached,
  (projectId: string, _limit?: number) => [
    tags.project(projectId),
    tags.backlinks(projectId),
  ],
);

async function getAuthorityDistributionUncached(projectId: string) {
  const rows = await db
    .select({
      bucket: sql<string>`
        case
          when ${backlinks.da} is null then 'Unknown'
          when ${backlinks.da} >= 50 then 'DA 50+'
          when ${backlinks.da} >= 30 then 'DA 30-49'
          when ${backlinks.da} >= 15 then 'DA 15-29'
          else 'DA 0-14'
        end`,
      value: count().mapWith(Number),
    })
    .from(backlinks)
    .where(eq(backlinks.projectId, projectId))
    .groupBy(sql`1`);

  const order = ["DA 50+", "DA 30-49", "DA 15-29", "DA 0-14", "Unknown"];
  return order
    .map((label) => ({
      label,
      value: rows.find((r) => r.bucket === label)?.value ?? 0,
    }))
    .filter((r) => r.value > 0);
}

/** DA buckets — link-quality mix for the health card. */
export const getAuthorityDistribution = cachedQuery(
  "dashboard:authority-distribution",
  getAuthorityDistributionUncached,
  (projectId) => [tags.project(projectId), tags.backlinks(projectId)],
);

async function getPageTypeDistributionUncached(projectId: string) {
  const rows = await db
    .select({ label: pages.type, value: count().mapWith(Number) })
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .groupBy(pages.type)
    .orderBy(desc(count()));
  return rows as LabelledCount[];
}

/** Page-type mix from the On Page sheet. */
export const getPageTypeDistribution = cachedQuery(
  "dashboard:page-type-distribution",
  getPageTypeDistributionUncached,
  (projectId) => [tags.project(projectId), tags.pages(projectId)],
);

async function getIntentDistributionUncached(projectId: string) {
  const rows = await db
    .select({
      label: sql<string>`coalesce(${keywords.intent}, 'Unclassified')`,
      value: count().mapWith(Number),
    })
    .from(keywords)
    .where(eq(keywords.projectId, projectId))
    .groupBy(sql`1`)
    .orderBy(desc(count()));
  return rows as LabelledCount[];
}

/** Keyword intent mix. */
export const getIntentDistribution = cachedQuery(
  "dashboard:intent-distribution",
  getIntentDistributionUncached,
  (projectId) => [tags.project(projectId), tags.keywords(projectId)],
);

/** Progress against the project's monthly targets. */
export function computeTargetProgress(
  kpis: ProjectKpis,
  targets: { backlinks: number; keywords: number; content: number },
) {
  return {
    backlinks: {
      actual: kpis.backlinks.thisMonth,
      target: targets.backlinks,
      percent: percentOf(kpis.backlinks.thisMonth, targets.backlinks),
    },
    page1: {
      actual: kpis.keywords.page1,
      target: targets.keywords,
      percent: percentOf(kpis.keywords.page1, targets.keywords),
    },
    indexRate: {
      actual: kpis.backlinks.indexed,
      target: kpis.backlinks.total,
      percent: kpis.backlinks.indexRate,
    },
    onPage: {
      actual: kpis.pages.optimised,
      target: kpis.pages.total,
      percent: percentOf(kpis.pages.optimised, kpis.pages.total),
    },
  };
}

export { ratio };
