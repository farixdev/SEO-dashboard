import { Download, Link2 } from "lucide-react";
import Link from "next/link";

import { MiniStat } from "@/components/charts/stat-card";
import {
  FilterChips,
  FilterSelect,
  PageSizeSelect,
  Pagination,
  SearchInput,
  Toolbar,
} from "@/components/tables/toolbar";
import { TableMeta } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { getBacklinkAssignees, listBacklinks } from "@/db/queries/backlinks";
import { getProjectStaff } from "@/db/queries/team";
import { getAvailableMonths } from "@/db/queries/dashboard";
import { BacklinksTable } from "@/features/backlinks/backlinks-table";
import { requireProjectAccess } from "@/lib/auth";
import { BACKLINK_STATUSES, BACKLINK_TYPES } from "@/lib/constants";
import { type RawSearchParams, parseListQuery, totalPages } from "@/lib/query";
import { formatNumber, formatPercent, monthLabel, percentOf } from "@/lib/utils";

export default async function BacklinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const { user } = await requireProjectAccess(id);

  const query = parseListQuery(raw, { defaultSort: "publishedDate", defaultDir: "desc" });

  const [{ rows, total, summary }, assignees, staff, months] = await Promise.all([
    listBacklinks(id, query, { includeSecrets: true }),
    // Who actually has links — the right list for the *filter*.
    getBacklinkAssignees(id),
    // Everyone on the project — the right list for "Built by" on the form.
    // Deriving that from existing links meant a specialist who had not built
    // one here yet could never be credited for their first.
    getProjectStaff(id),
    getAvailableMonths(id),
  ]);

  const canEdit = user.role !== "CLIENT";

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label="Matching links"
          value={formatNumber(total)}
          sublabel={`${formatNumber(summary.published)} published`}
        />
        <MiniStat
          label="Indexed"
          value={formatNumber(summary.indexed)}
          tone={percentOf(summary.indexed, total) >= 30 ? "success" : "warning"}
          sublabel={formatPercent(percentOf(summary.indexed, total))}
        />
        <MiniStat
          label="Average DA"
          value={summary.avgDa ? summary.avgDa.toFixed(0) : "—"}
          tone="info"
        />
        <MiniStat
          label="Average spam score"
          value={summary.avgSpam ? summary.avgSpam.toFixed(1) : "—"}
          tone={
            (summary.avgSpam ?? 0) <= 3
              ? "success"
              : (summary.avgSpam ?? 0) <= 5
                ? "warning"
                : "danger"
          }
        />
      </div>

      <Toolbar>
        <SearchInput
          placeholder="Search URL, anchor text or notes…"
          className="w-full sm:w-72"
        />
        <FilterSelect
          paramName="type"
          allLabel="All types"
          options={BACKLINK_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <FilterSelect
          paramName="status"
          allLabel="Any status"
          options={BACKLINK_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          paramName="indexed"
          allLabel="Indexed?"
          options={[
            { value: "yes", label: "Indexed" },
            { value: "no", label: "Not indexed" },
          ]}
        />
        <FilterSelect
          paramName="assignee"
          allLabel="Anyone"
          options={[
            { value: "unassigned", label: "Unassigned" },
            ...assignees
              .filter((a) => a.id)
              .map((a) => ({ value: a.id as string, label: `${a.name} (${a.value})` })),
          ]}
        />
        <FilterSelect
          paramName="month"
          allLabel="All months"
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/api/export/backlinks?projectId=${id}`} prefetch={false}>
            <Button variant="ghost" size="sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
          <Link href={`/app/projects/${id}/import?entity=backlinks`}>
            <Button variant="secondary" size="sm">
              <Link2 className="size-4" />
              Bulk import
            </Button>
          </Link>
        </div>
      </Toolbar>

      <div className="mb-3">
        <FilterChips
          labels={{
            type: "Type",
            status: "Status",
            indexed: "Indexed",
            assignee: "Built by",
            month: "Month",
          }}
        />
      </div>

      <BacklinksTable
        projectId={id}
        rows={rows}
        canEdit={canEdit}
        // Always include yourself, so "Built by" can default to you even on a
        // project you are not formally a member of.
        assignees={
          staff.some((a) => a.id === user.id)
            ? staff.map((a) => ({ id: a.id, name: a.name }))
            : [{ id: user.id, name: user.name }, ...staff.map((a) => ({ id: a.id, name: a.name }))]
        }
        currentUserId={user.id}
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
