import { CheckCircle2, Clock, ListChecks } from "lucide-react";
import type { Metadata } from "next";

import { MiniStat } from "@/components/charts/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { listTasks } from "@/db/queries/tasks";
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  type TaskCategory,
  type TaskStatus,
} from "@/lib/constants";
import { requirePortalProject } from "@/lib/portal";
import { formatDate, formatNumber, percentOf, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "What we're working on" };

const VISIBLE_COLUMNS: TaskStatus[] = ["IN_PROGRESS", "REVIEW", "BACKLOG", "DONE"];

const COLUMN_COPY: Record<TaskStatus, string> = {
  IN_PROGRESS: "Being worked on right now",
  REVIEW: "Finished and being checked",
  BACKLOG: "Planned and queued up",
  DONE: "Completed",
};

export default async function PortalProgressPage() {
  const { projectId } = await requirePortalProject();

  const tasks = await listTasks(projectId, { clientVisibleOnly: true });

  const done = tasks.filter((t) => t.status === "DONE").length;
  const active = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const queued = tasks.filter((t) => t.status === "BACKLOG").length;

  if (tasks.length === 0) {
    return (
      <>
        <PageHeader title="What we're working on" />
        <Card>
          <EmptyState
            icon={<ListChecks className="size-6" />}
            title="No shared tasks yet"
            description="Your team publishes work items here as the campaign progresses, so you can always see what is underway."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="What we're working on"
        description="The work your SEO team has planned, in progress and completed for your site."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="In progress" value={formatNumber(active)} tone="info" />
        <MiniStat label="Planned" value={formatNumber(queued)} />
        <MiniStat label="Completed" value={formatNumber(done)} tone="success" />
        <MiniStat
          label="Overall progress"
          value={`${Math.round(percentOf(done, tasks.length))}%`}
          tone="brand"
        />
      </div>

      <Card className="mb-6">
        <CardBody className="pt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-body text-[13px] font-medium">
              {done} of {tasks.length} items completed
            </span>
            <span className="text-faint tnum text-[12px]">
              {Math.round(percentOf(done, tasks.length))}%
            </span>
          </div>
          <ProgressBar value={percentOf(done, tasks.length)} tone="success" />
        </CardBody>
      </Card>

      <div className="space-y-6">
        {VISIBLE_COLUMNS.map((status) => {
          const items = tasks.filter((t) => t.status === status);
          if (!items.length) return null;
          return (
            <Card key={status}>
              <CardHeader
                title={TASK_STATUS_LABELS[status]}
                description={COLUMN_COPY[status]}
                icon={
                  status === "DONE" ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Clock className="size-4" />
                  )
                }
                action={<Badge tone="neutral">{items.length}</Badge>}
              />
              <CardBody>
                <ul className="grid gap-2 md:grid-cols-2">
                  {items.map((task) => (
                    <li key={task.id} className="well px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-strong min-w-0 text-[13px] leading-[1.4] font-medium">
                          {task.title}
                        </p>
                        {status === "DONE" ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-mint-600)]" />
                        ) : null}
                      </div>

                      {task.description ? (
                        <p className="text-muted mt-1.5 text-[12px] leading-[1.45]">
                          {task.description}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {TASK_CATEGORY_LABELS[task.category as TaskCategory] ??
                            task.category}
                        </Badge>
                        {task.assigneeName ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar
                              name={task.assigneeName}
                              color={task.assigneeColor}
                              size="xs"
                            />
                            <span className="text-faint text-[11.5px]">
                              {task.assigneeName}
                            </span>
                          </span>
                        ) : null}
                        {task.completedAt ? (
                          <span className="text-faint text-[11.5px]">
                            finished {relativeTime(task.completedAt)}
                          </span>
                        ) : task.dueDate ? (
                          <span className="text-faint text-[11.5px]">
                            due {formatDate(task.dueDate)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
