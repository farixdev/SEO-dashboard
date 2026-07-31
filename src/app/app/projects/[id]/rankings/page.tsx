import { Download, Grid3x3, PencilLine, Upload } from "lucide-react";
import Link from "next/link";

import { MiniStat } from "@/components/charts/stat-card";
import { TableMeta } from "@/components/tables/data-table";
import {
  FilterSelect,
  PageSizeSelect,
  Pagination,
  SearchInput,
  Toolbar,
} from "@/components/tables/toolbar";
import { Button } from "@/components/ui/button";
import { getPageOptions } from "@/db/queries/keywords";
import {
  getMonthEntryRows,
  getMonthSummary,
  getRankMatrix,
  getRankMonths,
} from "@/db/queries/rankings";
import { ClearMonthButton } from "@/features/rankings/clear-month";
import { MonthEntryGrid } from "@/features/rankings/month-entry";
import { RankMatrix } from "@/features/rankings/rank-matrix";
import { requireProjectAccess } from "@/lib/auth";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { currentMonthKey, formatNumber, monthLabel } from "@/lib/utils";

import { MonthPicker } from "../month-picker";

export default async function RankingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const { user } = await requireProjectAccess(id);

  const one = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const mode = one("mode") === "entry" && user.role !== "CLIENT" ? "entry" : "matrix";
  const recordedMonths = await getRankMonths(id);
  const monthOptions = recordedMonths.length
    ? [...recordedMonths].reverse()
    : [currentMonthKey()];

  // Entry mode can target a month that has no data yet.
  const pickerMonths = monthOptions.includes(currentMonthKey())
    ? monthOptions
    : [currentMonthKey(), ...monthOptions];

  const monthParam = one("month");
  const month =
    monthParam && pickerMonths.includes(monthParam)
      ? monthParam
      : (pickerMonths[0] ?? currentMonthKey());

  const summary = await getMonthSummary(id, month);
  const basePath = `/app/projects/${id}/rankings`;

  if (mode === "entry") {
    const rows = await getMonthEntryRows(id, month);
    // Pre-fill the "date checked" box from whatever this month already carries.
    const existingCheckedOn = rows.find((r) => r.checkedOn)?.checkedOn ?? null;

    return (
      <>
        <ModeSwitch mode="entry" basePath={basePath} month={month} />
        <div className="mb-4 flex items-center justify-end gap-2">
          <ClearMonthButton
            projectId={id}
            month={month}
            recordedCount={rows.filter((r) => r.position != null).length}
          />
          <MonthPicker months={pickerMonths} current={month} basePath={`${basePath}`} />
        </div>
        <MonthEntryGrid
          // Remounting on month change resets the grid, so the inputs can never
          // show the previous month's positions.
          key={month}
          projectId={id}
          month={month}
          checkedOn={existingCheckedOn}
          rows={rows}
        />
      </>
    );
  }

  const query = parseListQuery(raw, { defaultSort: "current", defaultDir: "asc" });
  const pageOptions = await getPageOptions(id);

  const windowParam = Number(one("window"));
  const windowSize = [6, 12, 18, 24].includes(windowParam) ? windowParam : 12;

  const matrix = await getRankMatrix(id, {
    window: windowSize,
    q: query.q || undefined,
    priorityOnly: query.filters.priority === "yes",
    pageId: query.filters.page && query.filters.page !== "unmapped" ? query.filters.page : undefined,
    page: query.page,
    pageSize: query.pageSize,
    sort: (["current", "delta", "volume", "keyword"] as const).includes(
      query.sort as never,
    )
      ? (query.sort as "current" | "delta" | "volume" | "keyword")
      : "current",
    dir: query.dir,
  });

  return (
    <>
      <ModeSwitch mode="matrix" basePath={basePath} month={month} canEdit={user.role !== "CLIENT"} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat
          label={`Tracked in ${monthLabel(month)}`}
          value={formatNumber(summary.tracked)}
          sublabel={
            summary.deltas.tracked !== 0
              ? `${summary.deltas.tracked > 0 ? "+" : ""}${summary.deltas.tracked} vs prior`
              : undefined
          }
        />
        <MiniStat
          label="Top 3"
          value={formatNumber(summary.top3)}
          tone="success"
          sublabel={
            summary.deltas.top3 !== 0
              ? `${summary.deltas.top3 > 0 ? "+" : ""}${summary.deltas.top3}`
              : "no change"
          }
        />
        <MiniStat
          label="Top 10 (page 1)"
          value={formatNumber(summary.top10)}
          tone="success"
          sublabel={
            summary.deltas.top10 !== 0
              ? `${summary.deltas.top10 > 0 ? "+" : ""}${summary.deltas.top10}`
              : "no change"
          }
        />
        <MiniStat label="Top 20" value={formatNumber(summary.top20)} tone="info" />
        <MiniStat
          label="Average position"
          value={summary.avgPosition ? summary.avgPosition.toFixed(1) : "—"}
          tone={
            summary.deltas.avgPosition == null
              ? "neutral"
              : summary.deltas.avgPosition > 0
                ? "success"
                : "warning"
          }
          sublabel={
            summary.deltas.avgPosition != null
              ? `${summary.deltas.avgPosition > 0 ? "improved" : "declined"} ${Math.abs(summary.deltas.avgPosition).toFixed(1)}`
              : undefined
          }
        />
      </div>

      <Toolbar>
        <SearchInput placeholder="Search keyword or page…" className="w-full sm:w-72" />
        <FilterSelect
          paramName="priority"
          allLabel="All keywords"
          options={[{ value: "yes", label: "Priority only" }]}
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
        <div className="ml-auto">
          <Link href={`/api/export/rankings?projectId=${id}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
        </div>
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

function ModeSwitch({
  mode,
  basePath,
  month,
  canEdit = true,
}: {
  mode: "matrix" | "entry";
  basePath: string;
  month: string;
  canEdit?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="well inline-flex gap-1 p-1">
        <Link
          href={basePath}
          className={
            mode === "matrix"
              ? "surface-raised text-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium shadow-[var(--elev-1)]"
              : "text-muted hover:text-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium"
          }
        >
          <Grid3x3 className="size-3.5" />
          Rank history
        </Link>
        {canEdit ? (
          <Link
            href={`${basePath}?mode=entry&month=${month}`}
            className={
              mode === "entry"
                ? "surface-raised text-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium shadow-[var(--elev-1)]"
                : "text-muted hover:text-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium"
            }
          >
            <PencilLine className="size-3.5" />
            Enter positions
          </Link>
        ) : null}
      </div>

      {canEdit && mode === "matrix" ? (
        <Link href={`${basePath.replace("/rankings", "")}/import?entity=rankings`}>
          <Button variant="secondary" size="sm">
            <Upload className="size-4" />
            Paste a month of positions
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
