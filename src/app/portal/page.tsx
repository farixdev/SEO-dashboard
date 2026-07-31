import {
  ArrowUpRight,
  Clock,
  Link2,
  MessagesSquare,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  AveragePositionChart,
  LinkTypeDonut,
  PageOneTrendChart,
  SearchTrendChart,
} from "@/components/charts/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import {
  Glossary,
  HeroRow,
  HeroStat,
  Masthead,
  Milestone,
  Panel,
  RankSpread,
  Timeline,
  Verdict,
} from "@/components/ui/premium";
import {
  computeTargetProgress,
  resolveReportMonth,
  getAveragePositionTrend,
  getBacklinksByType,
  getProjectKpis,
  getRankDistribution,
  getSearchTrend,
} from "@/db/queries/dashboard";
import { getRankMovers } from "@/db/queries/keywords";
import { listThreads } from "@/db/queries/messages";
import { listTasks } from "@/db/queries/tasks";
import { requirePortalProject } from "@/lib/portal";
import {
  compactNumber,  formatNumber,
  formatPercent,
  monthLabel,
  monthLabelLong,
  relativeTime,
} from "@/lib/utils";

import { MonthPicker } from "../app/projects/[id]/month-picker";

export const metadata: Metadata = { title: "Your SEO progress" };

export default async function PortalOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { user, project, projectId } = await requirePortalProject();

  const { month, months } = await resolveReportMonth(projectId, monthParam);

  const [
    kpis,
    linksByType,
    rankDistribution,
    searchTrend,
    positionTrend,
    movers,
    tasks,
    threads,
  ] = await Promise.all([
    getProjectKpis(projectId, month),
    getBacklinksByType(projectId),
    getRankDistribution(projectId, month),
    getSearchTrend(projectId),
    getAveragePositionTrend(projectId),
    getRankMovers(projectId, month, 6),
    listTasks(projectId, { clientVisibleOnly: true }),
    listThreads(user.id, { projectId, includeInternal: false, limit: 3 }),
  ]);

  const targets = computeTargetProgress(kpis, {
    backlinks: project.monthlyBacklinkTarget,
    keywords: project.monthlyKeywordTarget,
    content: project.monthlyContentTarget,
  });

  const totalLinks = linksByType.reduce((a, t) => a + t.value, 0);
  const hasData = totalLinks > 0 || kpis.keywords.tracked > 0;

  if (!hasData) {
    return (
      <>
        <Masthead
          eyebrow="Welcome"
          title={`Hello, ${user.name.split(" ")[0]}`}
          subtitle="Your campaign is being set up. As soon as your team records the first month of work, your results appear here."
        />
        <Card>
          <EmptyState
            icon={<Clock className="size-6" />}
            title="Nothing to report just yet"
            description="Your SEO team is loading your keywords, pages and link data."
            action={
              <Link href="/portal/messages">
                <Button variant="primary">
                  <MessagesSquare className="size-4" />
                  Message your team
                </Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  /* ── Turn the numbers into a plain-language read ──────────────── */

  const positionDelta =
    kpis.keywords.avgPosition != null && kpis.keywords.avgPositionPrev != null
      ? kpis.keywords.avgPositionPrev - kpis.keywords.avgPosition
      : null;

  // Null in the first month of a campaign — treat "no comparison yet" as
  // neither winning nor struggling rather than reading it as a decline.
  const impressionsDelta = kpis.search.impressionsDelta;
  const winning =
    kpis.keywords.improved >= kpis.keywords.declined &&
    (impressionsDelta ?? 0) >= 0;
  const struggling =
    kpis.keywords.declined > kpis.keywords.improved &&
    impressionsDelta !== null &&
    impressionsDelta < 0;

  const verdictTone = winning ? "positive" : struggling ? "attention" : "steady";
  const verdictHeadline = winning
    ? `${monthLabelLong(month)} moved you forward.`
    : struggling
      ? `${monthLabelLong(month)} was a slower month — here's where the effort is going.`
      : `${monthLabelLong(month)} held steady while the groundwork continues.`;

  const points = [
    `Of the ${formatNumber(kpis.keywords.tracked)} keyword position${kpis.keywords.tracked === 1 ? "" : "s"} checked in ${monthLabel(month)}, ${formatNumber(kpis.keywords.page1)} rank${kpis.keywords.page1 === 1 ? "s" : ""} on the first page of Google and ${formatNumber(kpis.keywords.top3)} sit in the top three. Your plan covers ${formatNumber(kpis.keywords.total)} keywords in total.`,
    kpis.keywords.improved || kpis.keywords.declined
      ? `${kpis.keywords.improved} keyword${kpis.keywords.improved === 1 ? "" : "s"} climbed the rankings this month and ${kpis.keywords.declined} slipped.`
      : "Rankings held their positions this month.",
    impressionsDelta === null
      ? `Your site was shown ${compactNumber(kpis.search.impressions)} times in Google results, earning ${formatNumber(kpis.search.clicks)} visits. This is the first month of data, so there is nothing to compare it against yet.`
      : `Your site was shown ${compactNumber(kpis.search.impressions)} times in Google results, ${impressionsDelta >= 0 ? "up" : "down"} ${Math.abs(impressionsDelta).toFixed(0)}% on the previous month, earning ${formatNumber(kpis.search.clicks)} visits.`,
    `${formatNumber(kpis.backlinks.thisMonth)} new link${kpis.backlinks.thisMonth === 1 ? "" : "s"} were earned from other websites, taking your total to ${formatNumber(kpis.backlinks.total)}.`,
  ];

  /* ── Rank spread bands ────────────────────────────────────────── */

  const spread = [
    {
      label: "Page 1 — top 10 results",
      value: rankDistribution.find((d) => d.page === 1)?.value ?? 0,
      tone: "var(--color-mint-500)",
    },
    {
      label: "Page 2",
      value: rankDistribution.find((d) => d.page === 2)?.value ?? 0,
      tone: "var(--color-sky-500)",
    },
    {
      label: "Pages 3–5",
      value: rankDistribution
        .filter((d) => d.page >= 3 && d.page <= 5)
        .reduce((a, d) => a + d.value, 0),
      tone: "var(--color-amber-500)",
    },
    {
      label: "Page 6 and beyond",
      value: rankDistribution.find((d) => d.page === 6)?.value ?? 0,
      tone: "var(--line-strong)",
    },
  ];

  const completedRecently = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))
    .slice(0, 5);

  return (
    <>
      <Masthead
        eyebrow={`${monthLabelLong(month)} report`}
        title={project.clientCompany ?? project.name}
        subtitle="Here is how your search visibility is progressing, and what your team has been working on."
        action={
          <>
            <MonthPicker months={months} current={month} basePath="/portal" />
            <Link href="/portal/report">
              <Button variant="primary">Full report</Button>
            </Link>
          </>
        }
      >
        <HeroRow>
          <HeroStat
            label="On page 1 of Google"
            value={formatNumber(kpis.keywords.page1)}
            unit={`of ${formatNumber(kpis.keywords.tracked)} checked`}
            // "tracked" is how many positions were actually measured this
            // month, which is usually far fewer than the keywords on file.
            // Saying both stops the smaller number reading as the whole list.
            caption={`${formatNumber(kpis.keywords.top3)} in the top 3 · ${formatNumber(kpis.keywords.total)} keywords on your plan`}
            tone="success"
            icon={<TrendingUp className="size-3.5" />}
          />
          <HeroStat
            label="Average position"
            value={
              kpis.keywords.avgPosition ? kpis.keywords.avgPosition.toFixed(1) : "—"
            }
            delta={positionDelta}
            deltaSuffix=" places"
            caption="lower is better"
            tone="brand"
            icon={<Target className="size-3.5" />}
          />
          <HeroStat
            label="Seen in search"
            value={compactNumber(kpis.search.impressions)}
            delta={kpis.search.impressionsDelta}
            caption={`${formatNumber(kpis.search.clicks)} visits · ${formatPercent(kpis.search.ctr, 2)} click rate`}
            tone="info"
            icon={<Search className="size-3.5" />}
          />
          <HeroStat
            label="New backlinks"
            value={formatNumber(kpis.backlinks.thisMonth)}
            delta={kpis.backlinks.monthDelta}
            caption={`${formatNumber(kpis.backlinks.total)} earned in total`}
            tone="warning"
            icon={<Link2 className="size-3.5" />}
          />
        </HeroRow>
      </Masthead>

      {/* ── The read ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Verdict tone={verdictTone} headline={verdictHeadline} points={points} />

        <Panel title="This month's targets" description="What we committed to deliver.">
          <div className="space-y-5">
            <Milestone
              label="Backlinks earned"
              actual={targets.backlinks.actual}
              target={targets.backlinks.target}
              unit="link"
            />
            <Milestone
              label="Keywords on page 1"
              actual={targets.page1.actual}
              target={targets.page1.target}
              unit="ranking"
            />
            <Milestone
              label="Pages fully optimised"
              actual={targets.onPage.actual}
              target={targets.onPage.target}
              unit="page"
              caption={`${targets.onPage.actual} of ${targets.onPage.target} pages on your site are complete`}
            />
          </div>
        </Panel>
      </div>

      {/* ── Visibility ── */}
      <Panel
        title="Search visibility over time"
        description="How often your site appears in Google, and how many people click through."
        className="mb-6"
      >
        {searchTrend.length ? (
          <SearchTrendChart data={searchTrend} />
        ) : (
          <p className="text-faint py-10 text-center text-[12.5px]">
            Search Console data has not been added yet.
          </p>
        )}
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Where your keywords rank"
          description={`Distribution across Google's result pages in ${monthLabel(month)}.`}
        >
          <RankSpread bands={spread} />
        </Panel>

        <Panel
          title="Climbing to page 1"
          description="Keywords reaching the top 10 and top 3, month by month."
        >
          {positionTrend.length ? (
            <PageOneTrendChart data={positionTrend} />
          ) : (
            <p className="text-faint py-10 text-center text-[12.5px]">
              Not enough history yet.
            </p>
          )}
        </Panel>

        <Panel
          title="Average position"
          description="The average spot your tracked keywords hold. Position 1 is the top of Google."
        >
          {positionTrend.length ? (
            <AveragePositionChart data={positionTrend} />
          ) : (
            <p className="text-faint py-10 text-center text-[12.5px]">
              Not enough history yet.
            </p>
          )}
        </Panel>

        <Panel
          title="Your backlink profile"
          description="The mix of placements earned for your site."
        >
          {linksByType.length ? (
            <LinkTypeDonut data={linksByType} total={totalLinks} />
          ) : (
            <p className="text-faint py-10 text-center text-[12.5px]">No data yet.</p>
          )}
        </Panel>
      </div>

      {/* ── Movement + work ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel
          title="Biggest gains"
          description={`Keywords that climbed in ${monthLabel(month)}.`}
          className="lg:col-span-2"
        >
          {movers.gainers.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {movers.gainers.map((m) => (
                <li
                  key={m.id}
                  className="well flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="text-body min-w-0 flex-1 truncate text-[12.5px]">
                    {m.keyword}
                  </span>
                  <span className="text-faint tnum shrink-0 text-[11.5px]">
                    #{m.previous.toFixed(0)} → #{m.current.toFixed(0)}
                  </span>
                  <Badge tone="success">+{m.delta.toFixed(0)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint py-8 text-center text-[12.5px]">
              No upward movement recorded for this month yet.
            </p>
          )}
        </Panel>

        <Panel
          title="Recently completed"
          description="Work signed off by your team."
          action={
            <Link href="/portal/progress">
              <Button variant="ghost" size="sm">
                All work
                <ArrowUpRight className="size-3.5" />
              </Button>
            </Link>
          }
        >
          <Timeline
            items={completedRecently.map((t) => ({
              title: t.title,
              meta: `${t.assigneeName ?? "Your team"} · ${relativeTime(t.completedAt!)}`,
              tone: "good" as const,
            }))}
          />
        </Panel>
      </div>

      {/* ── Talk to us ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel
          title="Talk to your team"
          description="Questions, feedback, or a change you'd like made."
        >
          {threads.length ? (
            <ul className="space-y-2">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/portal/messages?thread=${thread.id}`}
                    className="well hover:surface-hover block px-3.5 py-3 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-strong truncate text-[13px] font-medium">
                        {thread.subject}
                      </span>
                      {thread.unread > 0 ? (
                        <Badge tone="brand">{thread.unread} new</Badge>
                      ) : null}
                    </div>
                    <p className="text-faint mt-0.5 truncate text-[11.5px]">
                      {thread.lastAuthor ? `${thread.lastAuthor} · ` : ""}
                      {relativeTime(thread.lastMessageAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-faint text-[12.5px]">
                No conversations yet — your team is one message away.
              </p>
            </div>
          )}
          <Link href="/portal/messages" className="mt-4 block">
            <Button variant="secondary" className="w-full">
              <MessagesSquare className="size-4" />
              Open messages
            </Button>
          </Link>
        </Panel>

        <Panel
          title="What the numbers mean"
          description="No jargon — here's the plain version."
          action={<Sparkles className="text-faint size-4" />}
        >
          <Glossary
            terms={[
              {
                term: "Impressions",
                meaning:
                  "How many times a page of your site appeared in Google's results. It measures visibility, not visits.",
              },
              {
                term: "Position",
                meaning:
                  "Where you appear in the results. Position 1 is the top; anything in the top 10 is page one.",
              },
              {
                term: "Backlink",
                meaning:
                  "A link from another website to yours. Google treats these as votes of confidence.",
              },
              {
                term: "Click-through rate",
                meaning:
                  "The share of people who saw your listing and clicked it. Higher means your title and description are working.",
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
