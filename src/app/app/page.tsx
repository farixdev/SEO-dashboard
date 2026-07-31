import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Link2,
  ListChecks,
  Plus,
  Search,
  TrendingUp,
  Triangle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/charts/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AvatarStack, EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { getLatestDataMonth } from "@/db/queries/dashboard";
import {
  getActivity,
  getAgencyOverview,
  getProjectsAtRisk,
  listProjectCards,
} from "@/db/queries/projects";
import { requireStaff } from "@/lib/auth";
import {
  compactNumber,
  formatNumber,
  hostOf,
  monthLabelLong,
  relativeTime,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireStaff();
  const scope = user.role === "SPECIALIST" ? user.projectIds : null;

  // Report on the newest month that holds data. Using the calendar month would
  // show a wall of zeros for any campaign whose latest data is last month.
  const projectIds = scope ?? user.projectIds;
  const month = await getLatestDataMonth(projectIds);

  const [cards, overview, activity] = await Promise.all([
    listProjectCards(projectIds, month),
    getAgencyOverview(projectIds, month),
    // Admins also see account-level entries, which carry no project id.
    getActivity(null, 12, user.projectIds, user.role === "ADMIN"),
  ]);

  const atRisk = getProjectsAtRisk(cards, month);

  return (
    <>
      <PageHeader
        title="Projects"
        description={`${overview.projects.active} active of ${overview.projects.total} — ${monthLabelLong(overview.month)}`}
        action={
          <Link href="/app/projects/new">
            <Button variant="primary">
              <Plus className="size-4" />
              New project
            </Button>
          </Link>
        }
      />

      {/* ── Agency rollup ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Links this month"
          value={formatNumber(overview.backlinks.thisMonth)}
          icon={<Link2 className="size-[18px]" />}
          tone="brand"
          sublabel={`of ${formatNumber(overview.projects.targetSum)} target`}
          chart={
            <ProgressBar
              value={overview.backlinks.targetProgress}
              tone={
                overview.backlinks.targetProgress >= 90
                  ? "success"
                  : overview.backlinks.targetProgress >= 60
                    ? "brand"
                    : "warning"
              }
              height="sm"
            />
          }
        />
        <StatCard
          label="Keywords on page 1"
          value={formatNumber(overview.rankings.page1)}
          icon={<TrendingUp className="size-[18px]" />}
          tone="success"
          sublabel={`${formatNumber(overview.rankings.top3)} in the top 3`}
        />
        <StatCard
          label="Search clicks"
          value={compactNumber(overview.search.clicks)}
          icon={<Search className="size-[18px]" />}
          tone="info"
          sublabel={`${compactNumber(overview.search.impressions)} impressions`}
        />
        <StatCard
          label="Open tasks"
          value={formatNumber(overview.tasks.open)}
          icon={<ListChecks className="size-[18px]" />}
          tone={overview.tasks.overdue > 0 ? "warning" : "neutral"}
          sublabel={
            overview.tasks.overdue > 0
              ? `${overview.tasks.overdue} overdue`
              : "nothing overdue"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Project cards ── */}
        <section>
          {cards.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Building2 className="size-6" />}
                title="No projects yet"
                description="Create a project for your first client. Everything — keywords, links, on-page work and their portal login — is managed inside it."
                action={
                  <Link href="/app/projects/new">
                    <Button variant="primary">
                      <Plus className="size-4" />
                      Create the first project
                    </Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <li key={card.id}>
                  <Link href={`/app/projects/${card.id}`} className="block h-full">
                    <Card className="panel-interactive flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-strong truncate text-[15px] font-semibold">
                            {card.name}
                          </h3>
                          <p className="text-faint mt-0.5 truncate text-[12px]">
                            {hostOf(card.websiteUrl)}
                            {card.clientCompany ? ` · ${card.clientCompany}` : ""}
                          </p>
                        </div>
                        <Badge
                          tone={
                            card.status === "ACTIVE"
                              ? "success"
                              : card.status === "PAUSED"
                                ? "warning"
                                : "neutral"
                          }
                          dot
                        >
                          {card.status.toLowerCase()}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <Metric label="Keywords" value={card.counts.keywords} />
                        <Metric label="Pages" value={card.counts.pages} />
                        <Metric label="Links" value={card.counts.backlinks} />
                        <Metric label="Page 1" value={card.counts.page1} tone="success" />
                      </div>

                      <div className="mt-4">
                        <div className="mb-1.5 flex items-baseline justify-between">
                          <span className="text-faint text-[11.5px]">
                            Monthly link target
                          </span>
                          <span className="text-muted tnum text-[11.5px] font-medium">
                            {card.counts.linksThisMonth}/{card.monthlyBacklinkTarget}
                          </span>
                        </div>
                        <ProgressBar
                          value={card.targetProgress}
                          height="sm"
                          tone={
                            card.targetProgress >= 90
                              ? "success"
                              : card.targetProgress >= 50
                                ? "brand"
                                : "warning"
                          }
                        />
                      </div>

                      <div
                        className="mt-4 flex items-center justify-between border-t pt-3.5"
                        style={{ borderColor: "var(--line-soft)" }}
                      >
                        {card.team.length ? (
                          <AvatarStack people={card.team} max={4} />
                        ) : (
                          <span className="text-faint text-[11.5px]">No team yet</span>
                        )}
                        <span className="text-[var(--accent)] inline-flex items-center gap-1 text-[12px] font-medium">
                          Open
                          <ArrowUpRight className="size-3.5" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Right rail ── */}
        <aside className="space-y-4">
          {atRisk.length > 0 ? (
            <Card>
              <CardHeader
                title={
                  atRisk[0]?.isCurrentMonth ? "Behind on targets" : "Missed target"
                }
                description={
                  atRisk[0]?.isCurrentMonth
                    ? "Pace measured against how far into the month we are."
                    : `Against the full monthly target for ${monthLabelLong(month)}.`
                }
                icon={<Triangle className="size-4" />}
              />
              <CardBody className="space-y-3">
                {atRisk.slice(0, 4).map((p) => (
                  <Link
                    key={p.id}
                    href={`/app/projects/${p.id}/backlinks`}
                    className="well hover:surface-hover block px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-strong truncate text-[13px] font-medium">
                        {p.name}
                      </span>
                      <span className="tnum shrink-0 text-[11.5px] font-semibold text-[var(--color-amber-600)]">
                        {Math.round(p.targetProgress)}%
                      </span>
                    </div>
                    <p className="text-faint mt-0.5 text-[11.5px]">
                      {p.counts.linksThisMonth} of {p.monthlyBacklinkTarget} links
                      {p.shortfall > 0
                        ? ` · ${p.shortfall} ${p.isCurrentMonth ? "behind pace" : "short"}`
                        : ""}
                    </p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : cards.length > 0 ? (
            <Card>
              <CardBody className="pt-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-mint-600)]" />
                  <div>
                    <p className="text-strong text-[13.5px] font-semibold">
                      All projects on pace
                    </p>
                    <p className="text-muted mt-1 text-[12.5px] leading-5">
                      Every active project is tracking against its monthly link
                      target for {monthLabelLong(month)}.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Recent activity" />
            <CardBody className="pb-4">
              {activity.length === 0 ? (
                <p className="text-faint py-4 text-[12.5px]">
                  Activity will appear here as the team adds data.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                      <div className="min-w-0">
                        <p className="text-body text-[12.5px] leading-[1.45]">
                          {entry.summary ?? `${entry.action} ${entry.entity}`}
                        </p>
                        <p className="text-faint mt-0.5 text-[11px]">
                          {entry.actorName}
                          {entry.projectName ? ` · ${entry.projectName}` : ""} ·{" "}
                          {relativeTime(entry.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="well px-2 py-2 text-center">
      <p
        className={
          tone === "success"
            ? "tnum text-[15px] leading-5 font-semibold text-[var(--color-mint-600)]"
            : "text-strong tnum text-[15px] leading-5 font-semibold"
        }
      >
        {value.toLocaleString()}
      </p>
      <p className="text-faint mt-0.5 text-[10.5px]">{label}</p>
    </div>
  );
}
