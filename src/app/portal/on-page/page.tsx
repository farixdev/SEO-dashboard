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
import { PageHeader } from "@/components/ui/misc";
import { resolveReportMonth } from "@/db/queries/dashboard";
import { listPages } from "@/db/queries/pages";
import { PagesTable } from "@/features/pages/pages-table";
import { PAGE_TYPES } from "@/lib/constants";
import { requirePortalProject } from "@/lib/portal";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { formatNumber, formatPercent, percentOf } from "@/lib/utils";

export const metadata: Metadata = { title: "Pages & content" };

export default async function PortalOnPagePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const { projectId } = await requirePortalProject();

  const query = parseListQuery(raw, { defaultSort: "sortOrder", defaultDir: "asc" });
  const { month } = await resolveReportMonth(projectId);

  const { rows, total, summary } = await listPages(projectId, query, { month });

  return (
    <>
      <PageHeader
        title="Pages & content"
        description="The on-page work completed on each page of your site, and how many keywords each one targets."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Pages tracked" value={formatNumber(total)} />
        <MiniStat
          label="On-page work complete"
          value={formatNumber(summary.optimised)}
          tone={percentOf(summary.optimised, total) >= 80 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.optimised, total), 0)}
        />
        <MiniStat
          label="Indexed by Google"
          value={formatNumber(summary.indexed)}
          tone={percentOf(summary.indexed, total) >= 80 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.indexed, total), 0)}
        />
        <MiniStat
          label="Average word count"
          value={summary.avgWords ? formatNumber(Math.round(summary.avgWords)) : "—"}
          tone="info"
        />
      </div>

      <Toolbar>
        <SearchInput
          placeholder="Search page title or URL…"
          className="w-full sm:w-72"
        />
        <FilterSelect
          paramName="type"
          allLabel="All page types"
          options={PAGE_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          paramName="onPage"
          allLabel="On-page: any"
          options={[
            { value: "done", label: "Complete" },
            { value: "pending", label: "In progress" },
          ]}
        />
        <div className="ml-auto">
          <Link href={`/api/export/pages?projectId=${projectId}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips labels={{ type: "Type", onPage: "On-page", indexed: "Indexed" }} />
      </div>

      <PagesTable projectId={projectId} rows={rows} canEdit={false} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <TableMeta
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            label="pages"
          />
          <PageSizeSelect />
        </div>
        <Pagination page={query.page} totalPages={totalPages(total, query.pageSize)} />
      </div>
    </>
  );
}
