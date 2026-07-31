import { Printer } from "lucide-react";
import type { Metadata } from "next";

import {
  LinkTypeDonut,
  LinksByMonthChart,
  PageOneTrendChart,
  SearchTrendChart,
} from "@/components/charts/dashboard-charts";
import {
  Table,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailRow, PageHeader, ProgressRing } from "@/components/ui/misc";
import {
  computeTargetProgress,
  resolveReportMonth,
  getAveragePositionTrend,
  getBacklinksByMonth,
  getBacklinksByType,
  getBacklinksByTypeForMonth,
  getProjectKpis,
  getSearchTrend,
} from "@/db/queries/dashboard";
import { getRankMovers } from "@/db/queries/keywords";
import { listTasks } from "@/db/queries/tasks";
import { HELP } from "@/lib/help";
import { requirePortalProject } from "@/lib/portal";
import {
  compactNumber,  formatDate,
  formatNumber,
  formatPercent,
  monthLabel,
  monthLabelLong,
} from "@/lib/utils";

import { MonthPicker } from "../../app/projects/[id]/month-picker";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Monthly report" };

export default async function PortalReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { project, projectId } = await requirePortalProject();

  const { month, months } = await resolveReportMonth(projectId, monthParam);

  const [
    kpis,
    linksByType,
    linksByMonth,
    typeThisMonth,
    searchTrend,
    positionTrend,
    movers,
    tasks,
  ] = await Promise.all([
    getProjectKpis(projectId, month),
    getBacklinksByType(projectId),
    getBacklinksByMonth(projectId),
    getBacklinksByTypeForMonth(projectId, month),
    getSearchTrend(projectId),
    getAveragePositionTrend(projectId),
    getRankMovers(projectId, month, 10),
    listTasks(projectId, { clientVisibleOnly: true }),
  ]);

  const targets = computeTargetProgress(kpis, {
    backlinks: project.monthlyBacklinkTarget,
    keywords: project.monthlyKeywordTarget,
    content: project.monthlyContentTarget,
  });

  const totalLinks = linksByType.reduce((a, t) => a + t.value, 0);
  const completedThisMonth = tasks.filter(
    (t) => t.completedAt && t.completedAt.toISOString().slice(0, 7) === month.slice(0, 7),
  );

  return (
    <>
      <div className="no-print">
        <PageHeader
          help={HELP.clientReport}
          title="Monthly report"
          description="A printable summary of the month. Use your browser's print dialog to save it as a PDF."
          action={
            <div className="flex items-center gap-2">
              <MonthPicker months={months} current={month} basePath="/portal/report" />
              <PrintButton />
            </div>
          }
        />
      </div>

      {/* ── Report header (also the print cover) ── */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-muted text-[12.5px] font-semibold tracking-[0.1em] uppercase">
              SEO performance report
            </p>
            <h1 className="mt-1 text-[26px] leading-8 font-semibold tracking-tight">
              {project.clientCompany ?? project.name}
            </h1>
            <p className="text-muted mt-1 text-[14px]">
              {monthLabelLong(month)} · {project.country}
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-faint text-[11.5px]">Prepared</p>
            <p className="text-body text-[12.5px] font-medium">
              {formatDate(new Date())}
            </p>
          </div>
        </div>
      </header>

      {/* ── Executive summary ── */}
      <Card className="mb-6">
        <CardHeader
          title="Summary"
          description={`Headline numbers for ${monthLabelLong(month)}.`}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label="Keywords on page 1"
              value={formatNumber(kpis.keywords.page1)}
              note={`${formatNumber(kpis.keywords.top3)} in the top 3`}
            />
            <Figure
              label="Average position"
              value={
                kpis.keywords.avgPosition ? kpis.keywords.avgPosition.toFixed(1) : "—"
              }
              note={
                kpis.keywords.avgPositionPrev && kpis.keywords.avgPosition
                  ? `${(kpis.keywords.avgPositionPrev - kpis.keywords.avgPosition).toFixed(1)} places vs last month`
                  : undefined
              }
            />
            <Figure
              label="Search impressions"
              value={compactNumber(kpis.search.impressions)}
              note={
                kpis.search.impressionsDelta === null
                  ? "first month of data"
                  : `${formatPercent(kpis.search.impressionsDelta, 0)} vs last month`
              }
            />
            <Figure
              label="Backlinks built"
              value={formatNumber(kpis.backlinks.thisMonth)}
              note={`${formatNumber(kpis.backlinks.total)} total to date`}
            />
          </div>

          <div
            className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <RingBlock
              label="Monthly link target"
              percent={targets.backlinks.percent}
              detail={`${targets.backlinks.actual} of ${targets.backlinks.target}`}
            />
            <RingBlock
              label="Page-1 keyword target"
              percent={targets.page1.percent}
              detail={`${targets.page1.actual} of ${targets.page1.target}`}
            />
            <RingBlock
              label="Links indexed"
              percent={targets.indexRate.percent}
              detail={`${targets.indexRate.actual} of ${targets.indexRate.target}`}
            />
            <RingBlock
              label="Pages optimised"
              percent={targets.onPage.percent}
              detail={`${targets.onPage.actual} of ${targets.onPage.target}`}
            />
          </div>
        </CardBody>
      </Card>

      {/* ── Search visibility ── */}
      <Card className="print-break mb-6">
        <CardHeader
          title="Search visibility"
          description="Impressions, clicks and organic sessions over the campaign."
        />
        <CardBody>
          {searchTrend.length ? (
            <SearchTrendChart data={searchTrend} />
          ) : (
            <p className="text-faint py-8 text-center text-[12.5px]">
              No Search Console data recorded.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Keywords reaching page 1" />
          <CardBody>
            {positionTrend.length ? (
              <PageOneTrendChart data={positionTrend} />
            ) : (
              <p className="text-faint py-8 text-center text-[12.5px]">
                Not enough history.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Backlinks built each month" />
          <CardBody>
            {linksByMonth.length ? (
              <LinksByMonthChart data={linksByMonth} />
            ) : (
              <p className="text-faint py-8 text-center text-[12.5px]">
                No backlinks recorded.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Ranking movement ── */}
      <Card className="print-break mb-6">
        <CardHeader
          title="Ranking movement"
          description={`Biggest position changes in ${monthLabel(month)}.`}
        />
        <CardBody>
          {movers.gainers.length || movers.losers.length ? (
            <TableShell>
              <Table minWidth={560}>
                <Thead>
                  <Th>Keyword</Th>
                  <Th width={90} align="right">
                    Volume
                  </Th>
                  <Th width={90} align="right">
                    Was
                  </Th>
                  <Th width={90} align="right">
                    Now
                  </Th>
                  <Th width={90} align="right">
                    Change
                  </Th>
                </Thead>
                <Tbody>
                  {[...movers.gainers, ...movers.losers].map((m) => (
                    <Tr key={m.id}>
                      <Td className="max-w-[280px]">
                        <span className="truncate">{m.keyword}</span>
                      </Td>
                      <Td align="right" numeric>
                        {formatNumber(m.volume)}
                      </Td>
                      <Td align="right" numeric>
                        #{m.previous.toFixed(0)}
                      </Td>
                      <Td align="right" numeric>
                        #{m.current.toFixed(0)}
                      </Td>
                      <Td align="right">
                        <Badge tone={m.delta > 0 ? "success" : "danger"}>
                          {m.delta > 0 ? "+" : ""}
                          {m.delta.toFixed(0)}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableShell>
          ) : (
            <p className="text-faint py-8 text-center text-[12.5px]">
              No month-over-month movement recorded for this period.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ── Link building detail ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`Links built in ${monthLabel(month)}`}
            description="By placement type."
          />
          <CardBody>
            {typeThisMonth.length ? (
              <dl className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
                {typeThisMonth.map((t) => (
                  <DetailRow key={t.label} label={t.label}>
                    {t.value}
                  </DetailRow>
                ))}
                <DetailRow label="Total">
                  <span className="text-strong font-semibold">
                    {formatNumber(kpis.backlinks.thisMonth)}
                  </span>
                </DetailRow>
              </dl>
            ) : (
              <p className="text-faint py-8 text-center text-[12.5px]">
                No links published this month.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Backlink profile to date" />
          <CardBody>
            {linksByType.length ? (
              <LinkTypeDonut data={linksByType} total={totalLinks} />
            ) : (
              <p className="text-faint py-8 text-center text-[12.5px]">No data.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Work completed ── */}
      <Card className="mb-6">
        <CardHeader
          title="Work completed this month"
          description={
            completedThisMonth.length
              ? `${completedThisMonth.length} deliverable${completedThisMonth.length === 1 ? "" : "s"} signed off.`
              : "No deliverables were marked complete in this period."
          }
        />
        <CardBody>
          {completedThisMonth.length ? (
            <ul className="space-y-2">
              {completedThisMonth.map((task) => (
                <li key={task.id} className="well px-3.5 py-2.5">
                  <p className="text-strong text-[13px] font-medium">{task.title}</p>
                  {task.description ? (
                    <p className="text-muted mt-0.5 text-[12px] leading-[1.45]">
                      {task.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint text-[12.5px]">
              Ongoing work continues — see “What we&rsquo;re working on” for the current
              queue.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ── Content status ── */}
      <Card>
        <CardHeader title="Site & content status" />
        <CardBody>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              <DetailRow label="Pages tracked">{formatNumber(kpis.pages.total)}</DetailRow>
              <DetailRow label="On-page work complete">
                {formatNumber(kpis.pages.optimised)}
              </DetailRow>
              <DetailRow label="Indexed by Google">
                {formatNumber(kpis.pages.indexed)}
              </DetailRow>
              <DetailRow label="Average word count">
                {kpis.pages.avgWordCount
                  ? formatNumber(Math.round(kpis.pages.avgWordCount))
                  : "—"}
              </DetailRow>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              <DetailRow label="Keywords tracked">
                {formatNumber(kpis.keywords.total)}
              </DetailRow>
              <DetailRow label="Backlinks built">
                {formatNumber(kpis.backlinks.total)}
              </DetailRow>
              <DetailRow label="Backlinks indexed">
                {formatNumber(kpis.backlinks.indexed)} (
                {formatPercent(kpis.backlinks.indexRate, 0)})
              </DetailRow>
              <DetailRow label="Average domain authority">
                {kpis.backlinks.avgDa ? kpis.backlinks.avgDa.toFixed(0) : "—"}
              </DetailRow>
            </div>
          </dl>
        </CardBody>
      </Card>

      <footer className="text-faint mt-8 flex items-center gap-2 text-[11.5px]">
        <Printer className="size-3.5" />
        Generated from live campaign data on {formatDate(new Date())}.
      </footer>
    </>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="well px-4 py-3.5">
      <p className="text-muted text-[12px] font-medium">{label}</p>
      <p className="text-strong tnum mt-1 text-[24px] leading-7 font-semibold">
        {value}
      </p>
      {note ? <p className="text-faint mt-0.5 text-[11.5px]">{note}</p> : null}
    </div>
  );
}

function RingBlock({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <ProgressRing
        value={percent}
        size={68}
        stroke={8}
        tone={percent >= 90 ? "success" : percent >= 50 ? "brand" : "warning"}
      />
      <div className="min-w-0">
        <p className="text-body text-[12.5px] font-medium">{label}</p>
        <p className="text-faint tnum text-[11.5px]">{detail}</p>
      </div>
    </div>
  );
}
