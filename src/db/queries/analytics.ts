import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { analyticsSnapshots } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { monthLabel, percentOf } from "@/lib/utils";

export type AnalyticsRow = {
  id: string;
  month: string;
  label: string;
  capturedOn: string | null;
  country: string;
  clicks: number;
  impressions: number;
  keywordCount: number | null;
  keywordCountLabel: string | null;
  gaTraffic: number | null;
  avgPosition: number | null;
  notes: string | null;
  /** derived, exactly as the sheet's columns I and J did */
  ctr: number;
  impressionGrowth: number | null;
  clickGrowth: number | null;
  trafficGrowth: number | null;
};

/**
 * Sheet columns I ("CTR %") and J ("Impression Increment Rate %") were
 * formulas over the previous row. Computed here in order rather than stored,
 * so editing one month never leaves a stale derived value behind.
 */
async function listAnalyticsUncached(projectId: string, country?: string) {
  const rows = await db
    .select()
    .from(analyticsSnapshots)
    .where(
      country
        ? and(
            eq(analyticsSnapshots.projectId, projectId),
            eq(analyticsSnapshots.country, country),
          )
        : eq(analyticsSnapshots.projectId, projectId),
    )
    .orderBy(asc(analyticsSnapshots.month));

  return rows.map<AnalyticsRow>((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    return {
      id: row.id,
      month: row.month,
      label: monthLabel(row.month),
      capturedOn: row.capturedOn,
      country: row.country,
      clicks: row.clicks,
      impressions: row.impressions,
      keywordCount: row.keywordCount,
      keywordCountLabel: row.keywordCountLabel,
      gaTraffic: row.gaTraffic,
      avgPosition: row.avgPosition,
      notes: row.notes,
      ctr: percentOf(row.clicks, row.impressions),
      impressionGrowth:
        prev && prev.impressions
          ? percentOf(row.impressions - prev.impressions, prev.impressions)
          : null,
      clickGrowth:
        prev && prev.clicks ? percentOf(row.clicks - prev.clicks, prev.clicks) : null,
      trafficGrowth:
        prev && prev.gaTraffic
          ? percentOf((row.gaTraffic ?? 0) - prev.gaTraffic, prev.gaTraffic)
          : null,
    };
  });
}

/** The whole month series in one shot — growth rates only make sense over the
 *  full ordered set, so there is nothing to paginate and the key space is just
 *  the country filter. */
export const listAnalytics = cachedQuery(
  "analytics:list",
  listAnalyticsUncached,
  // Full arity: a shorter tagsFor would narrow the inferred signature and drop
  // the optional `country` from every call site.
  (projectId: string, _country?: string) => [
    tags.project(projectId),
    tags.analytics(projectId),
  ],
  CACHE_TTL.aggregate,
);

/** Uncached: single row behind the edit form, which must show what was saved. */
export async function getAnalyticsRow(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(analyticsSnapshots)
    .where(
      and(eq(analyticsSnapshots.projectId, projectId), eq(analyticsSnapshots.id, id)),
    )
    .limit(1);
  return row ?? null;
}

async function getAnalyticsCountriesUncached(projectId: string) {
  const rows = await db
    .selectDistinct({ country: analyticsSnapshots.country })
    .from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.projectId, projectId))
    .orderBy(asc(analyticsSnapshots.country));
  return rows.map((r) => r.country);
}

/** Filter options — a new country only appears when a snapshot is added. */
export const getAnalyticsCountries = cachedQuery(
  "analytics:countries",
  getAnalyticsCountriesUncached,
  (projectId) => [tags.project(projectId), tags.analytics(projectId)],
  CACHE_TTL.reference,
);

/** Totals + best/worst month for the analytics page header. */
export function summariseAnalytics(rows: AnalyticsRow[]) {
  if (!rows.length) {
    return {
      totalClicks: 0,
      totalImpressions: 0,
      avgCtr: 0,
      peakImpressions: null as AnalyticsRow | null,
      peakClicks: null as AnalyticsRow | null,
      latest: null as AnalyticsRow | null,
      first: null as AnalyticsRow | null,
      impressionsGrowthAllTime: null as number | null,
    };
  }
  const totalClicks = rows.reduce((a, r) => a + r.clicks, 0);
  const totalImpressions = rows.reduce((a, r) => a + r.impressions, 0);
  const peakImpressions = rows.reduce((a, r) => (r.impressions > a.impressions ? r : a));
  const peakClicks = rows.reduce((a, r) => (r.clicks > a.clicks ? r : a));
  const first = rows[0];
  const latest = rows[rows.length - 1];

  return {
    totalClicks,
    totalImpressions,
    avgCtr: percentOf(totalClicks, totalImpressions),
    peakImpressions,
    peakClicks,
    latest,
    first,
    impressionsGrowthAllTime: first.impressions
      ? percentOf(latest.impressions - first.impressions, first.impressions)
      : null,
  };
}
