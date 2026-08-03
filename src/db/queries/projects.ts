import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLog,
  analyticsSnapshots,
  backlinks,
  keywords,
  pages,
  projectMembers,
  projects,
  rankings,
  tasks,
  threads,
  users,
} from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import { addMonths, currentMonthKey, percentOf } from "@/lib/utils";

/* Cross-project rollups are scoped by an id list that may be null (agency-wide),
   so they cannot enumerate per-entity tags. `invalidate()` always revalidates
   `project:<id>` and `projects`, so those two cover every edit either way. */
function scopeTags(projectIds: string[] | null): string[] {
  return [
    tags.projectList(),
    ...(projectIds ?? []).map((id) => tags.project(id)),
  ];
}

export type ProjectCard = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string;
  clientCompany: string | null;
  country: string;
  status: string;
  accentColor: string;
  monthlyBacklinkTarget: number;
  startDate: string | null;
  counts: {
    keywords: number;
    pages: number;
    backlinks: number;
    linksThisMonth: number;
    page1: number;
    openTasks: number;
  };
  targetProgress: number;
  clientName: string | null;
  team: { name: string; avatarColor: string | null }[];
};

/**
 * Project list with a health snapshot each. All the per-project aggregates are
 * done in one grouped pass rather than N queries.
 */
async function uncachedListProjectCards(
  projectIds: string[] | null,
  month = currentMonthKey(),
): Promise<ProjectCard[]> {
  if (projectIds && projectIds.length === 0) return [];
  const scope = projectIds ? inArray(projects.id, projectIds) : undefined;
  const monthEnd = addMonths(month, 1);

  const [rows, keywordCounts, pageCounts, linkCounts, rankCounts, taskCounts, members] =
    await Promise.all([
      db
        .select()
        .from(projects)
        .where(scope)
        .orderBy(
          // Active projects first, then most recently created.
          sql`case ${projects.status} when 'ACTIVE' then 0 when 'PAUSED' then 1 when 'COMPLETED' then 2 else 3 end`,
          desc(projects.createdAt),
        ),
      db
        .select({ projectId: keywords.projectId, value: count().mapWith(Number) })
        .from(keywords)
        .groupBy(keywords.projectId),
      db
        .select({ projectId: pages.projectId, value: count().mapWith(Number) })
        .from(pages)
        .groupBy(pages.projectId),
      db
        .select({
          projectId: backlinks.projectId,
          total: count().mapWith(Number),
          thisMonth: sql<number>`count(*) filter (
            where ${backlinks.publishedDate} >= ${month} and ${backlinks.publishedDate} < ${monthEnd}
          )`.mapWith(Number),
        })
        .from(backlinks)
        .groupBy(backlinks.projectId),
      db
        .select({
          projectId: rankings.projectId,
          page1: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
            Number,
          ),
        })
        .from(rankings)
        .where(eq(rankings.month, month))
        .groupBy(rankings.projectId),
      db
        .select({
          projectId: tasks.projectId,
          open: sql<number>`count(*) filter (where ${tasks.status} <> 'DONE')`.mapWith(
            Number,
          ),
        })
        .from(tasks)
        .groupBy(tasks.projectId),
      db
        .select({
          projectId: projectMembers.projectId,
          name: users.name,
          avatarColor: users.avatarColor,
          role: projectMembers.role,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(users.isActive, true)),
    ]);

  const kw = new Map(keywordCounts.map((r) => [r.projectId, r.value]));
  const pg = new Map(pageCounts.map((r) => [r.projectId, r.value]));
  const bl = new Map(linkCounts.map((r) => [r.projectId, r]));
  const rk = new Map(rankCounts.map((r) => [r.projectId, r.page1]));
  const tk = new Map(taskCounts.map((r) => [r.projectId, r.open]));

  return rows.map((p) => {
    const projectMembersList = members.filter((m) => m.projectId === p.id);
    const linksThisMonth = bl.get(p.id)?.thisMonth ?? 0;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      websiteUrl: p.websiteUrl,
      clientCompany: p.clientCompany,
      country: p.country,
      status: p.status,
      accentColor: p.accentColor,
      monthlyBacklinkTarget: p.monthlyBacklinkTarget,
      startDate: p.startDate,
      counts: {
        keywords: kw.get(p.id) ?? 0,
        pages: pg.get(p.id) ?? 0,
        backlinks: bl.get(p.id)?.total ?? 0,
        linksThisMonth,
        page1: rk.get(p.id) ?? 0,
        openTasks: tk.get(p.id) ?? 0,
      },
      targetProgress: percentOf(linksThisMonth, p.monthlyBacklinkTarget || 1),
      clientName:
        projectMembersList.find((m) => m.role === "CLIENT_VIEWER")?.name ?? null,
      team: projectMembersList
        .filter((m) => m.role !== "CLIENT_VIEWER")
        .map((m) => ({ name: m.name, avatarColor: m.avatarColor })),
    };
  });
}

export const listProjectCards = cachedQuery(
  "projects:list-project-cards",
  uncachedListProjectCards,
  // Full arity: a shorter tagsFor would narrow the inferred signature and drop
  // the optional `month` from every call site.
  (projectIds: string[] | null, _month?: string) => [
    ...scopeTags(projectIds),
    // Team avatars and the client name come from the joined users row.
    tags.users(),
  ],
  CACHE_TTL.rollup,
);

export async function getProject(id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function getProjectBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return row ?? null;
}

async function uncachedGetProjectMembers(projectId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      memberRole: projectMembers.role,
      avatarColor: users.avatarColor,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      title: users.title,
      // See the note on the team page: evaluated by Postgres so no impure
      // clock read happens while a component renders.
      hasPendingInvite: sql<boolean>`(
        ${users.inviteTokenHash} is not null
        and ${users.inviteAcceptedAt} is null
        -- a null expiry is "never expires", not "already lapsed"
        and (${users.inviteExpiresAt} is null or ${users.inviteExpiresAt} > now())
      )`,
      inviteExpiresAt: users.inviteExpiresAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(
      sql`case ${projectMembers.role} when 'OWNER' then 0 when 'MANAGER' then 1 when 'SPECIALIST' then 2 else 3 end`,
      asc(users.name),
    );
}

export const getProjectMembers = cachedQuery(
  "projects:get-project-members",
  uncachedGetProjectMembers,
  (projectId) => [
    tags.project(projectId),
    // Every displayed column but the membership role lives on the users row.
    tags.users(),
  ],
  CACHE_TTL.reference,
);

/** Cross-project rollup for the agency home page. */
async function uncachedGetAgencyOverview(
  projectIds: string[] | null,
  month = currentMonthKey(),
) {
  const monthEnd = addMonths(month, 1);
  const scope = projectIds ? inArray(projects.id, projectIds) : undefined;

  const [projectAgg, linkAgg, keywordAgg, rankAgg, taskAgg, analyticsAgg] =
    await Promise.all([
      db
        .select({
          total: count().mapWith(Number),
          active: sql<number>`count(*) filter (where ${projects.status} = 'ACTIVE')`.mapWith(
            Number,
          ),
          targetSum: sql<number>`coalesce(sum(${projects.monthlyBacklinkTarget}), 0)`.mapWith(
            Number,
          ),
        })
        .from(projects)
        .where(scope),
      db
        .select({
          total: count().mapWith(Number),
          thisMonth: sql<number>`count(*) filter (
            where ${backlinks.publishedDate} >= ${month} and ${backlinks.publishedDate} < ${monthEnd}
          )`.mapWith(Number),
          indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(
            Number,
          ),
        })
        .from(backlinks)
        .where(projectIds ? inArray(backlinks.projectId, projectIds) : undefined),
      db
        .select({ total: count().mapWith(Number) })
        .from(keywords)
        .where(projectIds ? inArray(keywords.projectId, projectIds) : undefined),
      db
        .select({
          page1: sql<number>`count(*) filter (where ${rankings.position} <= 10)`.mapWith(
            Number,
          ),
          top3: sql<number>`count(*) filter (where ${rankings.position} <= 3)`.mapWith(
            Number,
          ),
        })
        .from(rankings)
        .where(
          projectIds
            ? and(inArray(rankings.projectId, projectIds), eq(rankings.month, month))
            : eq(rankings.month, month),
        ),
      db
        .select({
          open: sql<number>`count(*) filter (where ${tasks.status} <> 'DONE')`.mapWith(
            Number,
          ),
          overdue: sql<number>`count(*) filter (
            where ${tasks.status} <> 'DONE' and ${tasks.dueDate} < current_date
          )`.mapWith(Number),
        })
        .from(tasks)
        .where(projectIds ? inArray(tasks.projectId, projectIds) : undefined),
      db
        .select({
          clicks: sql<number>`coalesce(sum(${analyticsSnapshots.clicks}), 0)`.mapWith(
            Number,
          ),
          impressions: sql<number>`coalesce(sum(${analyticsSnapshots.impressions}), 0)`.mapWith(
            Number,
          ),
        })
        .from(analyticsSnapshots)
        .where(
          projectIds
            ? and(
                inArray(analyticsSnapshots.projectId, projectIds),
                eq(analyticsSnapshots.month, month),
              )
            : eq(analyticsSnapshots.month, month),
        ),
    ]);

  const links = linkAgg[0] ?? { total: 0, thisMonth: 0, indexed: 0 };
  const targetSum = projectAgg[0]?.targetSum ?? 0;

  return {
    month,
    projects: projectAgg[0] ?? { total: 0, active: 0, targetSum: 0 },
    backlinks: {
      ...links,
      indexRate: percentOf(links.indexed, links.total),
      targetProgress: percentOf(links.thisMonth, targetSum || 1),
    },
    keywords: keywordAgg[0]?.total ?? 0,
    rankings: rankAgg[0] ?? { page1: 0, top3: 0 },
    tasks: taskAgg[0] ?? { open: 0, overdue: 0 },
    search: analyticsAgg[0] ?? { clicks: 0, impressions: 0 },
  };
}

export const getAgencyOverview = cachedQuery(
  "projects:get-agency-overview",
  uncachedGetAgencyOverview,
  // Full arity, so the optional `month` survives on the public signature.
  (projectIds: string[] | null, _month?: string) => scopeTags(projectIds),
  CACHE_TTL.rollup,
);

/* ── Activity feed ─────────────────────────────────────────────── */

/**
 * @param includeGlobal also return account-level entries — invites, password
 *   resets, deactivations, project deletions — which carry no project id.
 *   Without it `inArray` drops every NULL, and those rows become invisible in
 *   the only place the audit trail is shown. Admin-only, since an entry like
 *   "Created an invite link for x@y.com" is not scoped to a project and should
 *   not leak to a specialist on an unrelated account.
 */
export async function getActivity(
  projectId: string | null,
  limit = 25,
  projectIds?: string[] | null,
  includeGlobal = false,
) {
  const scoped = projectId
    ? eq(activityLog.projectId, projectId)
    : projectIds
      ? inArray(activityLog.projectId, projectIds)
      : undefined;

  const where =
    includeGlobal && !projectId
      ? scoped
        ? or(scoped, isNull(activityLog.projectId))
        : undefined
      : scoped;

  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      entity: activityLog.entity,
      summary: activityLog.summary,
      createdAt: activityLog.createdAt,
      actorName: sql<string>`coalesce(${users.name}, ${activityLog.actorName}, 'System')`,
      actorColor: users.avatarColor,
      projectName: projects.name,
      projectId: activityLog.projectId,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.actorId))
    .leftJoin(projects, eq(projects.id, activityLog.projectId))
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

export async function logActivity(entry: {
  projectId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
  meta?: unknown;
}) {
  try {
    await db.insert(activityLog).values({
      projectId: entry.projectId ?? null,
      actorId: entry.actorId ?? null,
      actorName: entry.actorName ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      meta: entry.meta ?? null,
    });
  } catch {
    // The audit trail is a nice-to-have; never fail a user action over it.
  }
}

/** Unread message count across the user's projects — powers the nav badge. */
/**
 * @param includeInternal staff see agency-only threads; clients must not.
 *   Counting them for a client produced a badge they could never clear —
 *   it said 2 unread while the portal could only open 1, because the other
 *   thread 404s for them by design.
 */
export async function getUnreadCount(
  userId: string,
  projectIds: string[],
  includeInternal = true,
) {
  if (!projectIds.length) return 0;
  const rows = await db
    .select({ value: count().mapWith(Number) })
    .from(threads)
    .where(
      and(
        inArray(threads.projectId, projectIds),
        includeInternal ? undefined : eq(threads.isInternal, false),
        sql`exists (
          select 1 from messages m
          where m.thread_id = ${threads.id}
            and m.author_id is distinct from ${userId}
            and m.created_at > coalesce(
              (select tr.last_read_at from thread_reads tr
                where tr.thread_id = ${threads.id} and tr.user_id = ${userId}),
              'epoch'::timestamptz
            )
        )`,
      ),
    );
  return rows[0]?.value ?? 0;
}

/** Projects whose monthly link target is at risk — surfaced on the home page. */
/**
 * Projects tracking behind their monthly link target.
 *
 * Pace is prorated by how far into the month we are — but only when the month
 * being reported IS the current one. For a finished month the whole target was
 * due, so it is measured against 100% and described as a miss, not a lag.
 */
export function getProjectsAtRisk(
  cards: ProjectCard[],
  month = currentMonthKey(),
) {
  const isCurrentMonth = month === currentMonthKey();

  const now = new Date();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const expected = isCurrentMonth ? (now.getUTCDate() / daysInMonth) * 100 : 100;

  return cards
    .filter((c) => c.status === "ACTIVE" && c.targetProgress < expected - 15)
    .map((c) => ({
      ...c,
      expected,
      isCurrentMonth,
      shortfall: Math.round(
        (c.monthlyBacklinkTarget * expected) / 100 - c.counts.linksThisMonth,
      ),
    }))
    .sort((a, b) => a.targetProgress - b.targetProgress);
}

export { gte };
