import {
  ArrowDown,
  ArrowUp,
  FileText,
  Gauge,
  Link2,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import {
  AveragePositionChart,
  LinkTypeDonut,
  LinksByMonthChart,
  PageOneTrendChart,
  RankDistributionChart,
  SearchTrendChart,
} from "@/components/charts/dashboard-charts";
import { MiniStat, StatCard } from "@/components/charts/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  DetailRow,
  EmptyState,
  ProgressBar,
  ProgressRing,
  SectionTitle,
} from "@/components/ui/misc";
import {
  computeTargetProgress,
  resolveReportMonth,
  getAveragePositionTrend,
  getBacklinksByMonth,
  getBacklinksByType,
  getBacklinksByTypeForMonth,
  getProjectKpis,
  getRankDistribution,
  getSearchTrend,
} from "@/db/queries/dashboard";
import { getRankMovers } from "@/db/queries/keywords";
import { getContentHealth } from "@/db/queries/pages";
import { getTaskStats } from "@/db/queries/tasks";
import { requireProjectAccess } from "@/lib/auth";
import {
  compactNumber,  formatNumber,
  formatPercent,
  monthLabel,
  monthLabelLong,
} from "@/lib/utils";

import { MonthPicker } from "./month-picker";

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  const { project } = await requireProjectAccess(id);

  const { month, months: availableMonths } = await resolveReportMonth(id, monthParam);

  const [
    kpis,
    linksByType,
    linksByMonth,
    typeThisMonth,
    rankDistribution,
    searchTrend,
    positionTrend,
    movers,
    contentHealth,
    taskStats,
  ] = await Promise.all([
    getProjectKpis(id, month),
    getBacklinksByType(id),
    getBacklinksByMonth(id),
    getBacklinksByTypeForMonth(id, month),
    getRankDistribution(id, month),
    getSearchTrend(id),
    getAveragePositionTrend(id),
    getRankMovers(id, month, 5),
    getContentHealth(id),
    getTaskStats(id),
  ]);

  const targets = computeTargetProgress(kpis, {
    backlinks: project.monthlyBacklinkTarget,
    keywords: project.monthlyKeywordTarget,
    content: project.monthlyContentTarget,
  });

  const totalLinks = linksByType.reduce((a, t) => a + t.value, 0);
  const hasAnyData = totalLinks > 0 || kpis.keywords.total > 0 || kpis.pages.total > 0;

  if (!hasAnyData) {
    return (
      <Card>
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="This project has no data yet"
          description="Import your existing spreadsheet, or start adding keywords, pages and backlinks. Every metric on this page is computed from that data."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/app/projects/${id}/import`}>
                <Button variant="primary">Import from a spreadsheet</Button>
              </Link>
              <Link href={`/app/projects/${id}/keywords`}>
                <Button variant="secondary">Add keywords</Button>
              </Link>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <>
      {/* ── Month selector ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted text-[12.5px]">Reporting period</p>
          <p className="text-strong text-[15px] font-semibold">
            {monthLabelLong(month)}
          </p>
        </div>
        <MonthPicker months={availableMonths} current={month} basePath={`/app/projects/${id}`} />
      </div>

      {/* ── Headline KPIs ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Links built this month"
          value={formatNumber(kpis.backlinks.thisMonth)}
          delta={kpis.backlinks.monthDelta}
          deltaLabel="%"
          icon={<Link2 className="size-[18px]" />}
          tone="brand"
          sublabel={`vs ${formatNumber(kpis.backlinks.lastMonth)} last month`}
          chart={
            <ProgressBar
              value={targets.backlinks.percent}
              height="sm"
              tone={targets.backlinks.percent >= 90 ? "success" : "brand"}
            />
          }
        />
        <StatCard
          label="Keywords on page 1"
          value={formatNumber(kpis.keywords.page1)}
          icon={<TrendingUp className="size-[18px]" />}
          tone="success"
          sublabel={`${formatNumber(kpis.keywords.top3)} in the top 3 · ${formatNumber(kpis.keywords.tracked)} tracked`}
        />
        <StatCard
          label="Average position"
          value={
            kpis.keywords.avgPosition ? kpis.keywords.avgPosition.toFixed(1) : "—"
          }
          delta={
            kpis.keywords.avgPosition != null && kpis.keywords.avgPositionPrev != null
              ? kpis.keywords.avgPositionPrev - kpis.keywords.avgPosition
              : null
          }
          deltaLabel=" pos"
          icon={<Target className="size-[18px]" />}
          tone="info"
          sublabel={`${kpis.keywords.improved} up · ${kpis.keywords.declined} down`}
        />
        <StatCard
          label="Search impressions"
          value={compactNumber(kpis.search.impressions)}
          delta={kpis.search.impressionsDelta}
          icon={<Search className="size-[18px]" />}
          tone="warning"
          sublabel={`${formatNumber(kpis.search.clicks)} clicks · ${formatPercent(kpis.search.ctr, 2)} CTR`}
        />
      </div>

      {/* ── Targets ── */}
      <Card className="mb-6">
        <CardHeader
          title="Progress against monthly targets"
          description={`Targets are set per project in Settings — currently ${project.monthlyBacklinkTarget} links and ${project.monthlyKeywordTarget} page-1 keywords a month.`}
          icon={<Target className="size-4" />}
        />
        <CardBody>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <TargetRing
              label="Links built"
              actual={targets.backlinks.actual}
              target={targets.backlinks.target}
              percent={targets.backlinks.percent}
            />
            <TargetRing
              label="Page-1 keywords"
              actual={targets.page1.actual}
              target={targets.page1.target}
              percent={targets.page1.percent}
            />
            <TargetRing
              label="Links indexed"
              actual={targets.indexRate.actual}
              target={targets.indexRate.target}
              percent={targets.indexRate.percent}
              suffix="indexed"
            />
            <TargetRing
              label="Pages optimised"
              actual={targets.onPage.actual}
              target={targets.onPage.target}
              percent={targets.onPage.percent}
              suffix="pages"
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Search Console trend ── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Search Console & Analytics"
            description="Impressions on the left axis; clicks and GA sessions on the right."
            icon={<Search className="size-4" />}
            action={
              <Link href={`/app/projects/${id}/analytics`}>
                <Button variant="ghost" size="sm">
                  Manage data
                </Button>
              </Link>
            }
          />
          <CardBody>
            {searchTrend.length ? (
              <SearchTrendChart data={searchTrend} />
            ) : (
              <EmptyStateInline
                message="No Search Console data recorded yet."
                href={`/app/projects/${id}/analytics`}
                cta="Add a month"
              />
            )}
          </CardBody>
        </Card>

        {/* ── Links per month ── */}
        <Card>
          <CardHeader
            title="Links built per month"
            description="Indexed portion shown in green."
            icon={<Link2 className="size-4" />}
          />
          <CardBody>
            {linksByMonth.length ? (
              <LinksByMonthChart data={linksByMonth} />
            ) : (
              <EmptyStateInline
                message="No backlinks recorded yet."
                href={`/app/projects/${id}/backlinks`}
                cta="Add backlinks"
              />
            )}
          </CardBody>
        </Card>

        {/* ── Link type mix ── */}
        <Card>
          <CardHeader
            title="Link type mix"
            description={`All time · ${formatNumber(totalLinks)} links`}
          />
          <CardBody>
            {linksByType.length ? (
              <LinkTypeDonut data={linksByType} total={totalLinks} />
            ) : (
              <EmptyStateInline message="No backlinks recorded yet." />
            )}
          </CardBody>
        </Card>

        {/* ── Rank distribution ── */}
        <Card>
          <CardHeader
            title="Where keywords rank"
            description={`SERP page distribution for ${monthLabel(month)}`}
            icon={<TrendingUp className="size-4" />}
            action={
              <Link href={`/app/projects/${id}/rankings`}>
                <Button variant="ghost" size="sm">
                  Rank grid
                </Button>
              </Link>
            }
          />
          <CardBody>
            {rankDistribution.some((d) => d.value > 0) ? (
              <RankDistributionChart data={rankDistribution} />
            ) : (
              <EmptyStateInline
                message={`No positions recorded for ${monthLabel(month)}.`}
                href={`/app/projects/${id}/rankings`}
                cta="Enter positions"
              />
            )}
          </CardBody>
        </Card>

        {/* ── Average position ── */}
        <Card>
          <CardHeader
            title="Average position over time"
            description="Lower is better — the axis is inverted."
          />
          <CardBody>
            {positionTrend.length ? (
              <AveragePositionChart data={positionTrend} />
            ) : (
              <EmptyStateInline message="Not enough rank history yet." />
            )}
          </CardBody>
        </Card>

        {/* ── Page-1 growth ── */}
        <Card>
          <CardHeader
            title="Page-1 keyword growth"
            description="How many keywords sit in the top 10 and top 3 each month."
          />
          <CardBody>
            {positionTrend.length ? (
              <PageOneTrendChart data={positionTrend} />
            ) : (
              <EmptyStateInline message="Not enough rank history yet." />
            )}
          </CardBody>
        </Card>

        {/* ── This month by type ── */}
        <Card>
          <CardHeader
            title={`${monthLabel(month)} link breakdown`}
            description="What the team built this reporting period."
          />
          <CardBody>
            {typeThisMonth.length ? (
              <ul className="space-y-2">
                {typeThisMonth.map((t) => (
                  <li key={t.label} className="flex items-center gap-3">
                    <span className="text-body min-w-0 flex-1 truncate text-[12.5px]">
                      {t.label}
                    </span>
                    <div className="w-32">
                      <ProgressBar
                        value={(t.value / Math.max(...typeThisMonth.map((x) => x.value))) * 100}
                        height="sm"
                      />
                    </div>
                    <span className="text-strong tnum w-9 text-right text-[12.5px] font-semibold">
                      {t.value}
                    </span>
                  </li>
                ))}
                <li
                  className="flex items-center justify-between border-t pt-2.5 text-[12.5px]"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <span className="text-muted font-medium">Total</span>
                  <span className="text-strong tnum font-semibold">
                    {formatNumber(kpis.backlinks.thisMonth)}
                  </span>
                </li>
              </ul>
            ) : (
              <EmptyStateInline
                message={`No links published in ${monthLabel(month)} yet.`}
                href={`/app/projects/${id}/backlinks`}
                cta="Log a link"
              />
            )}
          </CardBody>
        </Card>

        {/* ── Movers ── */}
        <Card>
          <CardHeader
            title="Biggest movers"
            description={`Position change from ${monthLabel(month)} vs the month before.`}
          />
          <CardBody className="space-y-4">
            <div>
              <SectionTitle>Gained ground</SectionTitle>
              {movers.gainers.length ? (
                <ul className="space-y-1.5">
                  {movers.gainers.map((m) => (
                    <MoverRow key={m.id} {...m} direction="up" />
                  ))}
                </ul>
              ) : (
                <p className="text-faint text-[12px]">No improvements recorded.</p>
              )}
            </div>
            <div>
              <SectionTitle>Lost ground</SectionTitle>
              {movers.losers.length ? (
                <ul className="space-y-1.5">
                  {movers.losers.map((m) => (
                    <MoverRow key={m.id} {...m} direction="down" />
                  ))}
                </ul>
              ) : (
                <p className="text-faint text-[12px]">No declines recorded.</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ── Link health ── */}
        <Card>
          <CardHeader
            title="Backlink health"
            icon={<ShieldCheck className="size-4" />}
          />
          <CardBody>
            <div className="mb-4 grid grid-cols-2 gap-2.5">
              <MiniStat
                label="Index rate"
                value={formatPercent(kpis.backlinks.indexRate)}
                tone={kpis.backlinks.indexRate >= 30 ? "success" : "warning"}
                sublabel={`${formatNumber(kpis.backlinks.indexed)} of ${formatNumber(kpis.backlinks.total)}`}
              />
              <MiniStat
                label="Avg. DA"
                value={kpis.backlinks.avgDa ? kpis.backlinks.avgDa.toFixed(0) : "—"}
                tone="info"
              />
              <MiniStat
                label="Avg. spam score"
                value={kpis.backlinks.avgSpam ? kpis.backlinks.avgSpam.toFixed(1) : "—"}
                tone={
                  (kpis.backlinks.avgSpam ?? 0) <= 3
                    ? "success"
                    : (kpis.backlinks.avgSpam ?? 0) <= 5
                      ? "warning"
                      : "danger"
                }
              />
              <MiniStat
                label="Pending"
                value={formatNumber(kpis.backlinks.pending)}
                tone={kpis.backlinks.pending > 0 ? "warning" : "neutral"}
              />
            </div>
            <Link href={`/app/projects/${id}/backlinks`}>
              <Button variant="secondary" size="sm" className="w-full">
                Open backlink log
              </Button>
            </Link>
          </CardBody>
        </Card>

        {/* ── Content health ── */}
        <Card>
          <CardHeader
            title="Content & on-page"
            icon={<FileText className="size-4" />}
            action={
              <Link href={`/app/projects/${id}/on-page`}>
                <Button variant="ghost" size="sm">
                  Open
                </Button>
              </Link>
            }
          />
          <CardBody>
            <dl className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              <DetailRow label="Pages tracked">
                {formatNumber(contentHealth.total)}
              </DetailRow>
              <DetailRow label="On-page complete">
                <span className="inline-flex items-center gap-2">
                  {formatNumber(kpis.pages.optimised)}
                  <Badge tone={contentHealth.pending === 0 ? "success" : "warning"}>
                    {contentHealth.pending} pending
                  </Badge>
                </span>
              </DetailRow>
              <DetailRow label="Indexed">
                <span className="inline-flex items-center gap-2">
                  {formatNumber(kpis.pages.indexed)}
                  {contentHealth.notIndexed > 0 ? (
                    <Badge tone="danger">{contentHealth.notIndexed} not indexed</Badge>
                  ) : null}
                </span>
              </DetailRow>
              <DetailRow label="Average word count">
                {kpis.pages.avgWordCount
                  ? formatNumber(Math.round(kpis.pages.avgWordCount))
                  : "—"}
              </DetailRow>
              <DetailRow label="Thin content (< 500 words)">
                <Badge tone={contentHealth.thin > 0 ? "warning" : "success"}>
                  {contentHealth.thin}
                </Badge>
              </DetailRow>
              <DetailRow label="Missing a focus keyword">
                <Badge tone={contentHealth.noFocus > 0 ? "warning" : "success"}>
                  {contentHealth.noFocus}
                </Badge>
              </DetailRow>
              <DetailRow label="Open tasks">
                <span className="inline-flex items-center gap-2">
                  {taskStats.open}
                  {taskStats.overdue > 0 ? (
                    <Badge tone="danger">{taskStats.overdue} overdue</Badge>
                  ) : null}
                </span>
              </DetailRow>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/* ── Local presentational helpers ──────────────────────────────── */

function TargetRing({
  label,
  actual,
  target,
  percent,
  suffix = "links",
}: {
  label: string;
  actual: number;
  target: number;
  percent: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <ProgressRing
        value={percent}
        tone={percent >= 90 ? "success" : percent >= 50 ? "brand" : "warning"}
      />
      <div className="min-w-0">
        <p className="text-muted text-[12.5px] font-medium">{label}</p>
        <p className="text-strong tnum mt-0.5 text-[19px] leading-6 font-semibold">
          {formatNumber(actual)}
          <span className="text-faint text-[13px] font-normal"> / {formatNumber(target)}</span>
        </p>
        <p className="text-faint text-[11.5px]">{suffix}</p>
      </div>
    </div>
  );
}

function MoverRow({
  keyword,
  current,
  previous,
  delta,
  direction,
}: {
  keyword: string;
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down";
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={
          direction === "up"
            ? "grid size-5 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--color-mint-500)_18%,transparent)] text-[var(--color-mint-600)]"
            : "grid size-5 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--color-rose-500)_15%,transparent)] text-[var(--color-rose-600)]"
        }
      >
        <Icon className="size-3" />
      </span>
      <span className="text-body min-w-0 flex-1 truncate text-[12.5px]" title={keyword}>
        {keyword}
      </span>
      <span className="text-faint tnum shrink-0 text-[11.5px]">
        #{previous.toFixed(0)} → #{current.toFixed(0)}
      </span>
      <span
        className={
          direction === "up"
            ? "tnum w-8 shrink-0 text-right text-[12px] font-semibold text-[var(--color-mint-600)]"
            : "tnum w-8 shrink-0 text-right text-[12px] font-semibold text-[var(--color-rose-600)]"
        }
      >
        {delta > 0 ? "+" : ""}
        {delta.toFixed(0)}
      </span>
    </li>
  );
}

function EmptyStateInline({
  message,
  href,
  cta,
}: {
  message: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="well flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <p className="text-faint text-[12.5px]">{message}</p>
      {href && cta ? (
        <Link href={href}>
          <Button variant="secondary" size="sm">
            {cta}
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
