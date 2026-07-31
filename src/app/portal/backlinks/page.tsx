import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthorityChart } from "@/components/charts/dashboard-charts";
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
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { listBacklinks } from "@/db/queries/backlinks";
import {
  getAuthorityDistribution,
  getAvailableMonths,
} from "@/db/queries/dashboard";
import { BacklinksTable } from "@/features/backlinks/backlinks-table";
import { HELP } from "@/lib/help";
import { BACKLINK_TYPES } from "@/lib/constants";
import { requirePortalProject } from "@/lib/portal";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { formatNumber, formatPercent, monthLabel, percentOf } from "@/lib/utils";

export const metadata: Metadata = { title: "Backlinks" };

export default async function PortalBacklinksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const { projectId } = await requirePortalProject();

  const query = parseListQuery(raw, {
    defaultSort: "publishedDate",
    defaultDir: "desc",
  });

  // includeSecrets is deliberately omitted — login columns never reach a client.
  const [{ rows, total, summary }, months, authority] = await Promise.all([
    listBacklinks(projectId, query),
    getAvailableMonths(projectId),
    getAuthorityDistribution(projectId),
  ]);

  const authorityTotal = authority.reduce((a, d) => a + d.value, 0);

  return (
    <>
      <PageHeader
          help={HELP.backlinks}
        title="Backlinks"
        description="Every link your team has built to your site, with the authority and index status of each placement."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Links shown" value={formatNumber(total)} />
        <MiniStat
          label="Live & published"
          value={formatNumber(summary.published)}
          tone="success"
        />
        <MiniStat
          label="Indexed by Google"
          value={formatNumber(summary.indexed)}
          tone={percentOf(summary.indexed, total) >= 30 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.indexed, total), 0)}
        />
        <MiniStat
          label="Average domain authority"
          value={summary.avgDa ? summary.avgDa.toFixed(0) : "—"}
          tone="info"
          sublabel="higher is stronger"
        />
      </div>

      {authorityTotal > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="Link quality mix"
            description="Domain Authority (DA) is Moz's 0–100 estimate of how much ranking power a site carries."
          />
          <CardBody>
            <AuthorityChart data={authority} total={authorityTotal} />
          </CardBody>
        </Card>
      ) : null}

      <Toolbar>
        <SearchInput
          placeholder="Search URL or anchor text…"
          className="w-full sm:w-72"
        />
        <FilterSelect
          paramName="type"
          allLabel="All link types"
          options={BACKLINK_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          paramName="indexed"
          allLabel="Indexed?"
          options={[
            { value: "yes", label: "Indexed" },
            { value: "no", label: "Not yet indexed" },
          ]}
        />
        <FilterSelect
          paramName="month"
          allLabel="All months"
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <div className="ml-auto">
          <Link href={`/api/export/backlinks?projectId=${projectId}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips
          labels={{ type: "Type", indexed: "Indexed", month: "Month" }}
        />
      </div>

      <BacklinksTable
        projectId={projectId}
        rows={rows}
        assignees={[]}
        // Read-only: the form is never rendered here.
        currentUserId=""
        canEdit={false}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <TableMeta
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            label="links"
          />
          <PageSizeSelect />
        </div>
        <Pagination page={query.page} totalPages={totalPages(total, query.pageSize)} />
      </div>
    </>
  );
}
