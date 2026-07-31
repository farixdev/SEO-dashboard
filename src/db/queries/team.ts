import "server-only";

import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { backlinks, projectMembers, tasks, users } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { addMonths, percentOf } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   The "Self Analysis" sheet: per-specialist output, all time and for
   the selected month.
   ════════════════════════════════════════════════════════════════ */

export type TeamMemberStats = {
  id: string | null;
  name: string;
  email: string | null;
  role: string | null;
  avatarColor: string | null;
  allTime: {
    links: number;
    published: number;
    publishedRate: number;
    indexed: number;
    indexRate: number;
    avgDa: number | null;
    avgSpam: number | null;
  };
  month: {
    links: number;
    published: number;
    publishedRate: number;
    indexed: number;
    indexRate: number;
  };
  openTasks: number;
};

async function uncachedGetTeamPerformance(projectId: string, month: string) {
  const monthEnd = addMonths(month, 1);

  const [rows, taskRows] = await Promise.all([
    db
      .select({
        id: backlinks.assigneeId,
        name: sql<string>`coalesce(${users.name}, ${backlinks.assigneeName}, 'Unassigned')`,
        email: users.email,
        role: users.role,
        avatarColor: users.avatarColor,

        links: count().mapWith(Number),
        published: sql<number>`count(*) filter (where ${backlinks.status} = 'Published')`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(
          Number,
        ),
        avgDa: sql<number | null>`avg(${backlinks.da})`.mapWith(Number),
        avgSpam: sql<number | null>`avg(${backlinks.spamScore})`.mapWith(Number),

        monthLinks: sql<number>`count(*) filter (
          where ${backlinks.publishedDate} >= ${month} and ${backlinks.publishedDate} < ${monthEnd}
        )`.mapWith(Number),
        monthPublished: sql<number>`count(*) filter (
          where ${backlinks.status} = 'Published'
            and ${backlinks.publishedDate} >= ${month} and ${backlinks.publishedDate} < ${monthEnd}
        )`.mapWith(Number),
        monthIndexed: sql<number>`count(*) filter (
          where ${backlinks.indexed}
            and ${backlinks.publishedDate} >= ${month} and ${backlinks.publishedDate} < ${monthEnd}
        )`.mapWith(Number),
      })
      .from(backlinks)
      .leftJoin(users, eq(users.id, backlinks.assigneeId))
      .where(eq(backlinks.projectId, projectId))
      .groupBy(
        backlinks.assigneeId,
        users.name,
        users.email,
        users.role,
        users.avatarColor,
        backlinks.assigneeName,
      )
      .orderBy(desc(count())),

    db
      .select({
        assigneeId: tasks.assigneeId,
        open: sql<number>`count(*) filter (where ${tasks.status} <> 'DONE')`.mapWith(
          Number,
        ),
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.assigneeId),
  ]);

  const openByUser = new Map(taskRows.map((t) => [t.assigneeId, t.open]));

  return rows.map<TeamMemberStats>((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatarColor: r.avatarColor,
    allTime: {
      links: r.links,
      published: r.published,
      publishedRate: percentOf(r.published, r.links),
      indexed: r.indexed,
      indexRate: percentOf(r.indexed, r.links),
      avgDa: r.avgDa ?? null,
      avgSpam: r.avgSpam ?? null,
    },
    month: {
      links: r.monthLinks,
      published: r.monthPublished,
      publishedRate: percentOf(r.monthPublished, r.monthLinks),
      indexed: r.monthIndexed,
      indexRate: percentOf(r.monthIndexed, r.monthLinks),
    },
    openTasks: openByUser.get(r.id) ?? 0,
  }));
}

export const getTeamPerformance = cachedQuery(
  "team:get-team-performance",
  uncachedGetTeamPerformance,
  // Full arity: a shorter tagsFor would narrow the inferred signature and drop
  // `month` from every call site.
  (projectId: string, _month: string) => [
    tags.project(projectId),
    tags.backlinks(projectId),
    // The open-task column is a second scan over tasks.
    tags.tasks(projectId),
    // Name, email, role and avatar come from the joined users row.
    tags.users(),
  ],
);

/** Sheet A1:C4 — overall index health. */
async function uncachedGetBacklinkHealth(projectId: string) {
  const [row] = await db
    .select({
      total: count().mapWith(Number),
      indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(Number),
      notIndexed: sql<number>`count(*) filter (where not ${backlinks.indexed})`.mapWith(
        Number,
      ),
      published: sql<number>`count(*) filter (where ${backlinks.status} = 'Published')`.mapWith(
        Number,
      ),
      pending: sql<number>`count(*) filter (where ${backlinks.status} = 'Pending')`.mapWith(
        Number,
      ),
      highSpam: sql<number>`count(*) filter (where ${backlinks.spamScore} > 5)`.mapWith(
        Number,
      ),
      strongDa: sql<number>`count(*) filter (where ${backlinks.da} >= 50)`.mapWith(
        Number,
      ),
      noAnchor: sql<number>`count(*) filter (where ${backlinks.anchorText1} is null and ${backlinks.anchorText2} is null)`.mapWith(
        Number,
      ),
    })
    .from(backlinks)
    .where(eq(backlinks.projectId, projectId));

  const r =
    row ?? {
      total: 0,
      indexed: 0,
      notIndexed: 0,
      published: 0,
      pending: 0,
      highSpam: 0,
      strongDa: 0,
      noAnchor: 0,
    };

  return {
    ...r,
    indexRate: percentOf(r.indexed, r.total),
    publishRate: percentOf(r.published, r.total),
  };
}

export const getBacklinkHealth = cachedQuery(
  "team:get-backlink-health",
  uncachedGetBacklinkHealth,
  (projectId) => [tags.project(projectId), tags.backlinks(projectId)],
);

/** Team-member output over time, for the stacked monthly chart. */
async function uncachedGetTeamOutputTrend(projectId: string, months = 12) {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${backlinks.publishedDate}), 'YYYY-MM-DD')`,
      name: sql<string>`coalesce(${users.name}, ${backlinks.assigneeName}, 'Unassigned')`,
      value: count().mapWith(Number),
    })
    .from(backlinks)
    .leftJoin(users, eq(users.id, backlinks.assigneeId))
    .where(
      and(
        eq(backlinks.projectId, projectId),
        sql`${backlinks.publishedDate} is not null`,
      ),
    )
    .groupBy(
      sql`date_trunc('month', ${backlinks.publishedDate})`,
      users.name,
      backlinks.assigneeName,
    )
    .orderBy(asc(sql`date_trunc('month', ${backlinks.publishedDate})`));

  const monthKeys = Array.from(new Set(rows.map((r) => r.month))).slice(-months);
  const people = Array.from(new Set(rows.map((r) => r.name)));

  const data = monthKeys.map((month) => {
    const point: Record<string, string | number> = { month };
    for (const person of people) point[person] = 0;
    for (const row of rows.filter((r) => r.month === month)) {
      point[row.name] = row.value;
    }
    return point;
  });

  return { data, people };
}

export const getTeamOutputTrend = cachedQuery(
  "team:get-team-output-trend",
  uncachedGetTeamOutputTrend,
  (projectId: string, _months?: number) => [
    tags.project(projectId),
    tags.backlinks(projectId),
    // Series are keyed by the joined user's name.
    tags.users(),
  ],
);

/** Staff assigned to a project, for assignee pickers. */
async function uncachedGetProjectStaff(projectId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarColor: users.avatarColor,
      memberRole: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        sql`${projectMembers.role} <> 'CLIENT_VIEWER'`,
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(users.name));
}

export const getProjectStaff = cachedQuery(
  "team:get-project-staff",
  uncachedGetProjectStaff,
  (projectId) => [
    // Membership changes revalidate the whole project tag.
    tags.project(projectId),
    // Every displayed column but the membership role lives on the users row.
    tags.users(),
  ],
  CACHE_TTL.reference,
);

/** All active staff — the pool the admin can add to a project. */
async function uncachedGetAllStaff() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.role} <> 'CLIENT'`))
    .orderBy(asc(users.name));
}

export const getAllStaff = cachedQuery(
  "team:get-all-staff",
  uncachedGetAllStaff,
  // Agency-wide, so there is no project to scope on.
  () => [tags.users()],
  CACHE_TTL.reference,
);

/** Recent link-building velocity, used on the team page header. */
async function uncachedGetRecentVelocity(projectId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const [row] = await db
    .select({
      links: count().mapWith(Number),
      indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(Number),
    })
    .from(backlinks)
    .where(
      and(eq(backlinks.projectId, projectId), gte(backlinks.publishedDate, since)),
    );
  return { links: row?.links ?? 0, indexed: row?.indexed ?? 0, days };
}

// The window start is derived from the clock rather than an argument, so it
// cannot be part of the cache key; the TTL is what bounds how far it drifts.
export const getRecentVelocity = cachedQuery(
  "team:get-recent-velocity",
  uncachedGetRecentVelocity,
  (projectId: string, _days?: number) => [
    tags.project(projectId),
    tags.backlinks(projectId),
  ],
);
