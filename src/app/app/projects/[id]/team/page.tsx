import { ShieldCheck, Users } from "lucide-react";

import { TeamOutputChart } from "@/components/charts/dashboard-charts";
import { MiniStat } from "@/components/charts/stat-card";
import {
  Table,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  TrEmpty,
} from "@/components/tables/data-table";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  Avatar,
  EmptyState,
  PageHeader,
  ProgressBar,
} from "@/components/ui/misc";
import { resolveReportMonth } from "@/db/queries/dashboard";
import {
  getBacklinkHealth,
  getRecentVelocity,
  getTeamOutputTrend,
  getTeamPerformance,
} from "@/db/queries/team";
import { requireProjectAccess } from "@/lib/auth";
import {  formatNumber,
  formatPercent,
  monthLabel,
} from "@/lib/utils";

import { MonthPicker } from "../month-picker";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  await requireProjectAccess(id);

  const { month, months } = await resolveReportMonth(id, monthParam);

  const [team, health, trend, velocity] = await Promise.all([
    getTeamPerformance(id, month),
    getBacklinkHealth(id),
    getTeamOutputTrend(id),
    getRecentVelocity(id, 30),
  ]);

  const monthlyTotal = team.reduce((a, t) => a + t.month.links, 0);
  const maxAllTime = Math.max(1, ...team.map((t) => t.allTime.links));

  return (
    <>
      <PageHeader
        title="Team performance"
        description="Link-building output per specialist, all time and for the selected month."
        action={
          <MonthPicker
            months={months}
            current={month}
            basePath={`/app/projects/${id}/team`}
          />
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat label="Total links" value={formatNumber(health.total)} />
        <MiniStat
          label="Published"
          value={formatNumber(health.published)}
          tone="success"
          sublabel={formatPercent(health.publishRate)}
        />
        <MiniStat
          label="Indexed"
          value={formatNumber(health.indexed)}
          tone={health.indexRate >= 30 ? "success" : "warning"}
          sublabel={formatPercent(health.indexRate)}
        />
        <MiniStat
          label={`Built in ${monthLabel(month)}`}
          value={formatNumber(monthlyTotal)}
          tone="brand"
        />
        <MiniStat
          label="Last 30 days"
          value={formatNumber(velocity.links)}
          sublabel={`${velocity.indexed} indexed`}
          tone="info"
        />
      </div>

      {/* ── Per-person table ── */}
      <TableShell className="mb-6">
        <Table minWidth={1000}>
          <Thead>
            <Th>Specialist</Th>
            <Th width={170}>All-time links</Th>
            <Th width={110} align="right">
              Published
            </Th>
            <Th width={110} align="right">
              Indexed
            </Th>
            <Th width={90} align="right">
              Index rate
            </Th>
            <Th width={80} align="right">
              Avg. DA
            </Th>
            <Th width={90} align="right">
              Avg. spam
            </Th>
            <Th width={110} align="right">
              {monthLabel(month)}
            </Th>
            <Th width={100} align="right">
              Open tasks
            </Th>
          </Thead>
          <Tbody>
            {team.length === 0 ? (
              <TrEmpty colSpan={9}>
                <EmptyState
                  icon={<Users className="size-6" />}
                  title="No link activity yet"
                  description="Once the team logs backlinks with an owner, per-person performance appears here."
                />
              </TrEmpty>
            ) : (
              team.map((member) => (
                <Tr key={member.id ?? member.name}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={member.name}
                        color={member.avatarColor}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-strong truncate text-[13px] font-medium">
                          {member.name}
                        </p>
                        <p className="text-faint truncate text-[11px]">
                          {member.email ?? "No linked account"}
                        </p>
                      </div>
                    </div>
                  </Td>

                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <ProgressBar
                          value={(member.allTime.links / maxAllTime) * 100}
                          height="sm"
                        />
                      </div>
                      <span className="text-strong tnum w-10 text-right text-[12.5px] font-semibold">
                        {formatNumber(member.allTime.links)}
                      </span>
                    </div>
                  </Td>

                  <Td align="right" numeric>
                    {formatNumber(member.allTime.published)}
                  </Td>
                  <Td align="right" numeric>
                    {formatNumber(member.allTime.indexed)}
                  </Td>
                  <Td align="right" numeric>
                    <span
                      className={
                        member.allTime.indexRate >= 30
                          ? "font-medium text-[var(--color-mint-600)]"
                          : member.allTime.indexRate >= 10
                            ? "text-[var(--color-amber-600)]"
                            : "text-muted"
                      }
                    >
                      {formatPercent(member.allTime.indexRate, 0)}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {member.allTime.avgDa ? member.allTime.avgDa.toFixed(0) : "—"}
                  </Td>
                  <Td align="right" numeric>
                    {member.allTime.avgSpam ? member.allTime.avgSpam.toFixed(1) : "—"}
                  </Td>
                  <Td align="right" numeric>
                    <span className="text-strong font-semibold">
                      {formatNumber(member.month.links)}
                    </span>
                    {member.month.indexed > 0 ? (
                      <span className="text-faint ml-1 text-[11px]">
                        ({member.month.indexed} idx)
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right" numeric>
                    {member.openTasks > 0 ? (
                      member.openTasks
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </TableShell>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Monthly output by specialist"
            description="Stacked link counts per month."
            icon={<Users className="size-4" />}
          />
          <CardBody>
            {trend.data.length ? (
              <TeamOutputChart data={trend.data} people={trend.people} />
            ) : (
              <p className="text-faint py-10 text-center text-[12.5px]">
                No dated backlinks yet.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quality flags" icon={<ShieldCheck className="size-4" />} />
          <CardBody className="space-y-2.5">
            <Flag
              label="Links with no anchor text"
              value={health.noAnchor}
              tone={health.noAnchor > 0 ? "warning" : "success"}
              note="These do not count towards any keyword's target."
            />
            <Flag
              label="Spam score above 5"
              value={health.highSpam}
              tone={health.highSpam > 0 ? "danger" : "success"}
              note="Review before building more on these domains."
            />
            <Flag
              label="Pending publication"
              value={health.pending}
              tone={health.pending > 0 ? "warning" : "success"}
              note="Chase these up or mark them rejected."
            />
            <Flag
              label="Strong domains (DA 50+)"
              value={health.strongDa}
              tone="success"
              note="High-authority placements in the profile."
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Flag({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
  note: string;
}) {
  const colors = {
    success: "text-[var(--color-mint-600)]",
    warning: "text-[var(--color-amber-600)]",
    danger: "text-[var(--color-rose-600)]",
  } as const;
  return (
    <div className="well px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body text-[12.5px] font-medium">{label}</span>
        <span className={`tnum text-[15px] font-semibold ${colors[tone]}`}>{value}</span>
      </div>
      <p className="text-faint mt-0.5 text-[11px] leading-4">{note}</p>
    </div>
  );
}
