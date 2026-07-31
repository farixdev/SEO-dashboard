import { Download, Upload } from "lucide-react";
import Link from "next/link";

import { MiniStat } from "@/components/charts/stat-card";
import { Button } from "@/components/ui/button";
import {
  getAnalyticsCountries,
  listAnalytics,
  summariseAnalytics,
} from "@/db/queries/analytics";
import { AnalyticsView } from "@/features/analytics/analytics-view";
import { requireProjectAccess } from "@/lib/auth";
import type { RawSearchParams } from "@/lib/query";
import {
  addMonths,
  compactNumber,
  currentMonthKey,
  formatNumber,
  formatPercent,
} from "@/lib/utils";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const { user, project } = await requireProjectAccess(id);

  const countryParam = Array.isArray(raw.country) ? raw.country[0] : raw.country;
  const countries = await getAnalyticsCountries(id);
  const country =
    countryParam && countries.includes(countryParam) ? countryParam : undefined;

  const rows = await listAnalytics(id, country);
  const summary = summariseAnalytics(rows);

  /*
   * Adding a month meant typing the month, the capture date and the country
   * every time, on a form where all three are knowable: it is almost always
   * the month after the newest one on file, pulled today, for this project's
   * country. Computed on the server so the inputs hydrate deterministically.
   */
  const newestMonth = rows.length ? rows[rows.length - 1].month : null;
  const suggestedMonth = (
    newestMonth ? addMonths(newestMonth, 1) : currentMonthKey()
  ).slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat
            label="Total clicks"
            value={formatNumber(summary.totalClicks)}
            sublabel={`${rows.length} month${rows.length === 1 ? "" : "s"} recorded`}
          />
          <MiniStat
            label="Total impressions"
            value={compactNumber(summary.totalImpressions)}
            tone="info"
          />
          <MiniStat
            label="Blended CTR"
            value={formatPercent(summary.avgCtr, 2)}
            tone="brand"
          />
          <MiniStat
            label="Peak impressions"
            value={
              summary.peakImpressions
                ? compactNumber(summary.peakImpressions.impressions)
                : "—"
            }
            sublabel={summary.peakImpressions?.label}
            tone="success"
          />
        </div>

        <div className="flex items-center gap-2">
          {countries.length > 1 ? (
            <div className="well flex items-center gap-1 p-1">
              <Link
                href="?"
                className={
                  !country
                    ? "surface-raised text-strong rounded-lg px-2.5 py-1 text-[12.5px] font-medium shadow-[var(--elev-1)]"
                    : "text-muted hover:text-strong rounded-lg px-2.5 py-1 text-[12.5px] font-medium"
                }
              >
                All
              </Link>
              {countries.map((c) => (
                <Link
                  key={c}
                  href={`?country=${encodeURIComponent(c)}`}
                  className={
                    country === c
                      ? "surface-raised text-strong rounded-lg px-2.5 py-1 text-[12.5px] font-medium shadow-[var(--elev-1)]"
                      : "text-muted hover:text-strong rounded-lg px-2.5 py-1 text-[12.5px] font-medium"
                  }
                >
                  {c}
                </Link>
              ))}
            </div>
          ) : null}
          <Link href={`/api/export/analytics?projectId=${id}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
          {user.role !== "CLIENT" ? (
            <Link href={`/app/projects/${id}/import?entity=analytics`}>
              <Button variant="secondary" size="sm">
                <Upload className="size-4" />
                Bulk import
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <AnalyticsView
        projectId={id}
        rows={rows}
        canEdit={user.role !== "CLIENT"}
        suggestedMonth={suggestedMonth}
        today={today}
        defaultCountry={country ?? project.country}
      />
    </>
  );
}
