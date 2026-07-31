import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { TASK_STATUSES, type TaskStatus } from "@/lib/constants";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  dueDate: string | null;
  clientVisible: boolean;
  completedAt: Date | null;
  sortOrder: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  createdAt: Date;
};

/** Uncached: the board rewrites status and sort order by drag, and a card must
 *  land in its new column on the very next render. */
async function uncachedListTasks(
  projectId: string,
  options: { clientVisibleOnly?: boolean; assigneeId?: string } = {},
) {
  const clauses = [eq(tasks.projectId, projectId)];
  if (options.clientVisibleOnly) clauses.push(eq(tasks.clientVisible, true));
  if (options.assigneeId) clauses.push(eq(tasks.assigneeId, options.assigneeId));

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      category: tasks.category,
      dueDate: tasks.dueDate,
      clientVisible: tasks.clientVisible,
      completedAt: tasks.completedAt,
      sortOrder: tasks.sortOrder,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      assigneeColor: users.avatarColor,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(...clauses))
    .orderBy(
      asc(tasks.sortOrder),
      // Urgent first inside a column, then soonest due date.
      sql`case ${tasks.priority} when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`,
      sql`${tasks.dueDate} asc nulls last`,
      desc(tasks.createdAt),
    );

  return rows as TaskRow[];
}

/**
 * Cached: the table itself is the slowest query on the page, and it only
 * changes when someone edits data — which always invalidates these tags.
 */
export const listTasks = cachedQuery(
  "tasks:listTasks",
  uncachedListTasks,
  (projectId: string, _options?: { clientVisibleOnly?: boolean; assigneeId?: string }) => [
    tags.project(projectId),
    tags.users(),
  ],
  CACHE_TTL.aggregate,
);


/** Group into board columns, preserving the canonical column order. */
export function groupTasksByStatus(rows: TaskRow[]) {
  return TASK_STATUSES.map((status) => ({
    status: status as TaskStatus,
    tasks: rows.filter((t) => t.status === status),
  }));
}

async function getTaskStatsUncached(projectId: string) {
  const [row] = await db
    .select({
      total: count().mapWith(Number),
      open: sql<number>`count(*) filter (where ${tasks.status} <> 'DONE')`.mapWith(
        Number,
      ),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'DONE')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (
        where ${tasks.status} <> 'DONE' and ${tasks.dueDate} < current_date
      )`.mapWith(Number),
      dueThisWeek: sql<number>`count(*) filter (
        where ${tasks.status} <> 'DONE'
          and ${tasks.dueDate} >= current_date
          and ${tasks.dueDate} < current_date + interval '7 days'
      )`.mapWith(Number),
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  return row ?? { total: 0, open: 0, done: 0, overdue: 0, dueThisWeek: 0 };
}

/** Header counts for the task board and the project overview: one grouped scan
 *  over every task in the project, read on two pages per visit. */
export const getTaskStats = cachedQuery(
  "tasks:stats",
  getTaskStatsUncached,
  (projectId) => [tags.project(projectId), tags.tasks(projectId)],
  CACHE_TTL.aggregate,
);

/** Uncached: single row behind the edit form, which must show what was saved. */
export async function getTask(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.id, id)))
    .limit(1);
  return row ?? null;
}

/** Next sort position within a column, so new cards land at the bottom.
 *  Uncached: read on the insert path, so a stale max would collide. */
export async function nextSortOrder(projectId: string, status: string) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${tasks.sortOrder})`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
  return (row?.max ?? 0) + 10;
}
