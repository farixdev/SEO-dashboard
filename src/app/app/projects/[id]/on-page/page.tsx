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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveReportMonth } from "@/db/queries/dashboard";
import { getContentHealth, listPages } from "@/db/queries/pages";
import { PagesTable } from "@/features/pages/pages-table";
import { requireProjectAccess } from "@/lib/auth";
import { PAGE_TYPES, SEO_SCORE_BUCKETS } from "@/lib/constants";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { formatNumber, formatPercent, percentOf } from "@/lib/utils";

export default async function OnPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const { user } = await requireProjectAccess(id);

  const query = parseListQuery(raw, { defaultSort: "sortOrder", defaultDir: "asc" });
  const { month } = await resolveReportMonth(id);

  const [{ rows, total, summary }, health] = await Promise.all([
    listPages(id, query, { month }),
    getContentHealth(id),
  ]);

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Pages" value={formatNumber(total)} />
        <MiniStat
          label="On-page complete"
          value={formatNumber(summary.optimised)}
          tone={percentOf(summary.optimised, total) >= 80 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.optimised, total))}
        />
        <MiniStat
          label="Indexed"
          value={formatNumber(summary.indexed)}
          tone={percentOf(summary.indexed, total) >= 80 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.indexed, total))}
        />
        <MiniStat
          label="Average word count"
          value={summary.avgWords ? formatNumber(Math.round(summary.avgWords)) : "—"}
          tone="info"
        />
      </div>

      {/* ── Issues worth acting on ── */}
      {health.thin > 0 || health.noFocus > 0 || health.notIndexed > 0 ? (
        <div className="panel-flat mb-5 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-muted mr-1 text-[12px] font-semibold tracking-wider uppercase">
            Needs attention
          </span>
          {health.thin > 0 ? (
            <Link href="?minWords=1&maxWords=499">
              <Badge tone="warning">{health.thin} thin pages (&lt; 500 words)</Badge>
            </Link>
          ) : null}
          {health.notIndexed > 0 ? (
            <Link href="?indexed=no">
              <Badge tone="danger">{health.notIndexed} not indexed</Badge>
            </Link>
          ) : null}
          {health.pending > 0 ? (
            <Link href="?onPage=pending">
              <Badge tone="warning">{health.pending} on-page pending</Badge>
            </Link>
          ) : null}
          {health.noFaqs > 0 ? (
            <Link href="?faqs=no">
              <Badge tone="neutral">{health.noFaqs} without FAQs</Badge>
            </Link>
          ) : null}
          {health.missingMeta > 0 ? (
            <Badge tone="neutral">{health.missingMeta} missing meta description</Badge>
          ) : null}
        </div>
      ) : null}

      <Toolbar>
        <SearchInput
          placeholder="Search title, URL or focus keyword…"
          className="w-full sm:w-72"
        />
        <FilterSelect
          paramName="type"
          allLabel="All types"
          options={PAGE_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          paramName="score"
          allLabel="Any score"
          options={SEO_SCORE_BUCKETS.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          paramName="onPage"
          allLabel="On-page: any"
          options={[
            { value: "done", label: "Complete" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <FilterSelect
          paramName="indexed"
          allLabel="Index: any"
          options={[
            { value: "yes", label: "Indexed" },
            { value: "no", label: "Not indexed" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/api/export/pages?projectId=${id}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
          <Link href={`/app/projects/${id}/import?entity=pages`}>
            <Button variant="secondary" size="sm">
              <Upload className="size-4" />
              Bulk import
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips
          labels={{
            type: "Type",
            score: "Score",
            onPage: "On-page",
            indexed: "Indexed",
            faqs: "FAQs",
            minWords: "Min words",
            maxWords: "Max words",
          }}
        />
      </div>

      <PagesTable projectId={id} rows={rows} canEdit={user.role !== "CLIENT"} />

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
