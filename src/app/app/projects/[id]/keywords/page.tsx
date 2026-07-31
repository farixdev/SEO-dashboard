import { Download, Upload } from "lucide-react";
import Link from "next/link";

import { MiniStat } from "@/components/charts/stat-card";
import { TableMeta } from "@/components/tables/data-table";
import {
  FilterChips,
  FilterSelect,
  PageSizeSelect,
  Pagination,
  SearchInput,
  Toolbar,
} from "@/components/tables/toolbar";
import { Button } from "@/components/ui/button";
import { resolveReportMonth } from "@/db/queries/dashboard";
import { getPageOptions, listKeywords } from "@/db/queries/keywords";
import { KeywordsTable } from "@/features/keywords/keywords-table";
import { requireProjectAccess } from "@/lib/auth";
import { KEYWORD_INTENTS } from "@/lib/constants";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { compactNumber, formatNumber, monthLabel } from "@/lib/utils";

import { MonthPicker } from "../month-picker";

export default async function KeywordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const { user } = await requireProjectAccess(id);

  const query = parseListQuery(raw, { defaultSort: "volume", defaultDir: "desc" });
  const monthParam = Array.isArray(raw.month) ? raw.month[0] : raw.month;
  const { month, months } = await resolveReportMonth(id, monthParam);

  const [{ rows, total, summary }, pageOptions] = await Promise.all([
    listKeywords(id, query, { month }),
    getPageOptions(id),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Matching keywords" value={formatNumber(total)} />
          <MiniStat
            label="Priority"
            value={formatNumber(summary.priority)}
            tone="warning"
          />
          <MiniStat
            label="Combined volume"
            value={compactNumber(summary.totalVolume)}
            sublabel="searches / month"
            tone="info"
          />
          <MiniStat
            label="Average difficulty"
            value={summary.avgKd ? summary.avgKd.toFixed(0) : "—"}
          />
        </div>
        <MonthPicker
          months={months}
          current={month}
          basePath={`/app/projects/${id}/keywords`}
        />
      </div>

      <Toolbar>
        <SearchInput
          placeholder="Search keyword or page…"
          className="w-full sm:w-72"
        />
        <FilterSelect
          paramName="intent"
          allLabel="Any intent"
          options={KEYWORD_INTENTS.map((i) => ({ value: i, label: i }))}
        />
        <FilterSelect
          paramName="priority"
          allLabel="All keywords"
          options={[
            { value: "yes", label: "Priority only" },
            { value: "no", label: "Non-priority" },
          ]}
        />
        <FilterSelect
          paramName="page"
          allLabel="Any page"
          options={[
            { value: "unmapped", label: "Not mapped" },
            ...pageOptions.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/api/export/keywords?projectId=${id}&month=${month}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
          <Link href={`/app/projects/${id}/import?entity=keywords`}>
            <Button variant="secondary" size="sm">
              <Upload className="size-4" />
              Bulk import
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips
          labels={{ intent: "Intent", priority: "Priority", page: "Page" }}
        />
      </div>

      <p className="text-faint mb-3 text-[12px]">
        Rank and link columns reflect {monthLabel(month)}. “Links vs target”
        counts published backlinks whose anchor text matches the keyword.
      </p>

      <KeywordsTable
        projectId={id}
        rows={rows}
        pageOptions={pageOptions}
        canEdit={user.role !== "CLIENT"}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <TableMeta
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            label="keywords"
          />
          <PageSizeSelect />
        </div>
        <Pagination page={query.page} totalPages={totalPages(total, query.pageSize)} />
      </div>
    </>
  );
}
