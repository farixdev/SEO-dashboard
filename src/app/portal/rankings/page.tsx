import type { Metadata } from "next";

import { TableMeta } from "@/components/tables/data-table";
import {
  FilterSelect,
  PageSizeSelect,
  Pagination,
  SearchInput,
  Toolbar,
} from "@/components/tables/toolbar";
import { HeroRow, HeroStat, Masthead } from "@/components/ui/premium";
import { getPageOptions } from "@/db/queries/keywords";
import { getMonthSummary, getRankMatrix, getRankMonths } from "@/db/queries/rankings";
import { RankMatrix } from "@/features/rankings/rank-matrix";
import { requirePortalProject } from "@/lib/portal";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { currentMonthKey, formatNumber, monthLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Keyword rankings" };

export default async function PortalRankingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const { projectId } = await requirePortalProject();

  const one = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const query = parseListQuery(raw, { defaultSort: "current", defaultDir: "asc" });
  const recorded = await getRankMonths(projectId);
  const month = recorded.length ? recorded[recorded.length - 1] : currentMonthKey();

  const windowParam = Number(one("window"));
  const windowSize = [6, 12, 18, 24].includes(windowParam) ? windowParam : 12;

  const [summary, pageOptions, matrix] = await Promise.all([
    getMonthSummary(projectId, month),
    getPageOptions(projectId),
    getRankMatrix(projectId, {
      window: windowSize,
      q: query.q || undefined,
      priorityOnly: query.filters.priority === "yes",
      pageId:
        query.filters.page && query.filters.page !== "unmapped"
          ? query.filters.page
          : undefined,
      page: query.page,
      pageSize: query.pageSize,
      sort: (["current", "delta", "volume", "keyword"] as const).includes(
        query.sort as never,
      )
        ? (query.sort as "current" | "delta" | "volume" | "keyword")
        : "current",
      dir: query.dir,
    }),
  ]);

  return (
    <>
      <Masthead
        eyebrow="Keyword rankings"
        title="Where you rank in Google"
        subtitle={`Every keyword we track for you, month by month. Green cells are page-one positions. Latest data: ${monthLabel(month)}.`}
      >
        <HeroRow>
          <HeroStat
            label="Keywords tracked"
            value={formatNumber(summary.tracked)}
            caption="checked every month"
            tone="brand"
          />
          <HeroStat
            label="On page 1"
            value={formatNumber(summary.top10)}
            delta={summary.deltas.top10 || null}
            deltaSuffix=""
            caption="top 10 results"
            tone="success"
          />
          <HeroStat
            label="In the top 3"
            value={formatNumber(summary.top3)}
            delta={summary.deltas.top3 || null}
            deltaSuffix=""
            caption="the most valuable spots"
            tone="success"
          />
          <HeroStat
            label="Average position"
            value={summary.avgPosition ? summary.avgPosition.toFixed(1) : "—"}
            delta={summary.deltas.avgPosition}
            deltaSuffix=" places"
            caption="lower is better"
            tone="info"
          />
        </HeroRow>
      </Masthead>

      <Toolbar>
        <SearchInput placeholder="Search a keyword…" className="w-full sm:w-72" />
        <FilterSelect
          paramName="priority"
          allLabel="All keywords"
          options={[{ value: "yes", label: "Priority keywords" }]}
        />
        <FilterSelect
          paramName="page"
          allLabel="Any page"
          options={pageOptions.map((p) => ({ value: p.id, label: p.title }))}
        />
        <FilterSelect
          paramName="window"
          allLabel="Last 12 months"
          options={[
            { value: "6", label: "Last 6 months" },
            { value: "12", label: "Last 12 months" },
            { value: "18", label: "Last 18 months" },
            { value: "24", label: "Last 24 months" },
          ]}
        />
      </Toolbar>

      <RankMatrix
        months={matrix.months}
        monthLabels={matrix.monthLabels}
        rows={matrix.rows}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <TableMeta
            total={matrix.total}
            page={query.page}
            pageSize={query.pageSize}
            label="keywords"
          />
          <PageSizeSelect />
        </div>
        <Pagination
          page={query.page}
          totalPages={totalPages(matrix.total, query.pageSize)}
        />
      </div>
    </>
  );
}
