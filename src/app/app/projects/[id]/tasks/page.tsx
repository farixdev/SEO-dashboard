import { MiniStat } from "@/components/charts/stat-card";
import { PageHeader } from "@/components/ui/misc";
import { getProjectStaff } from "@/db/queries/team";
import { getTaskStats, groupTasksByStatus, listTasks } from "@/db/queries/tasks";
import { TaskBoard } from "@/features/tasks/task-board";
import { requireProjectAccess } from "@/lib/auth";
import { formatNumber, percentOf, formatPercent } from "@/lib/utils";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireProjectAccess(id);

  const [tasks, stats, staff] = await Promise.all([
    listTasks(id),
    getTaskStats(id),
    getProjectStaff(id),
  ]);

  return (
    <>
      <PageHeader
        title="Deliverables"
        description="The work board for this project. Anything marked client-visible shows on the client's progress page."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Open" value={formatNumber(stats.open)} />
        <MiniStat
          label="Overdue"
          value={formatNumber(stats.overdue)}
          tone={stats.overdue > 0 ? "danger" : "success"}
        />
        <MiniStat
          label="Due this week"
          value={formatNumber(stats.dueThisWeek)}
          tone={stats.dueThisWeek > 0 ? "warning" : "neutral"}
        />
        <MiniStat
          label="Completed"
          value={formatNumber(stats.done)}
          tone="success"
          sublabel={
            stats.total > 0
              ? `${formatPercent(percentOf(stats.done, stats.total), 0)} of all tasks`
              : undefined
          }
        />
      </div>

      <TaskBoard
        projectId={id}
        columns={groupTasksByStatus(tasks)}
        staff={staff.map((s) => ({
          id: s.id,
          name: s.name,
          avatarColor: s.avatarColor,
        }))}
        canEdit={user.role !== "CLIENT"}
      />
    </>
  );
}
