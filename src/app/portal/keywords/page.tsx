import { Download } from "lucide-react";
import type { Metadata } from "next";
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
import { KEYWORD_INTENTS } from "@/lib/constants";
import { requirePortalProject } from "@/lib/portal";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { compactNumber, formatNumber, monthLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Keyword list" };

export default async function PortalKeywordsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const { projectId } = await requirePortalProject();

  const query = parseListQuery(raw, { defaultSort: "volume", defaultDir: "desc" });
  const { month } = await resolveReportMonth(projectId);

  const [{ rows, total, summary }, pageOptions] = await Promise.all([
    listKeywords(projectId, query, { month }),
    getPageOptions(projectId),
  ]);

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Keywords tracked" value={formatNumber(total)} />
        <MiniStat
          label="Priority keywords"
          value={formatNumber(summary.priority)}
          tone="warning"
        />
        <MiniStat
          label="Combined monthly searches"
          value={compactNumber(summary.totalVolume)}
          tone="info"
        />
        <MiniStat
          label="Average difficulty"
          value={summary.avgKd ? summary.avgKd.toFixed(0) : "—"}
          sublabel="0 = easy, 100 = hard"
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
          options={[{ value: "yes", label: "Priority only" }]}
        />
        <FilterSelect
          paramName="page"
          allLabel="Any page"
          options={pageOptions.map((p) => ({ value: p.id, label: p.title }))}
        />
        <div className="ml-auto">
          <Link
            href={`/api/export/keywords?projectId=${projectId}&month=${month}`}
            prefetch={false}
          >
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips labels={{ intent: "Intent", priority: "Priority", page: "Page" }} />
      </div>

      <p className="text-faint mb-3 text-[12px]">
        Positions and link counts reflect {monthLabel(month)}. “Links vs target”
        shows how many backlinks point at each keyword.
      </p>

      <KeywordsTable
        projectId={projectId}
        rows={rows}
        pageOptions={pageOptions}
        canEdit={false}
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
