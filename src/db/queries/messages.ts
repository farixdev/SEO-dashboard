import "server-only";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  messages,
  projects,
  threadParticipants,
  threadReads,
  threads,
  users,
} from "@/db/schema";

/**
 * The single rule for "may this person see this conversation".
 *
 * A thread with no participant rows is project-wide, exactly as before. Once
 * anyone is named, only they and whoever started it may see it.
 *
 * Written once and reused by every read path — the list, the single thread,
 * the unread count and the polling endpoint. Splitting this rule across four
 * queries is how a private thread ends up visible in one of them.
 */
export function visibleToUser(userId: string) {
  return sql`(
    not exists (
      select 1 from ${threadParticipants} tp where tp.thread_id = ${threads.id}
    )
    or ${threads.createdById} = ${userId}
    or exists (
      select 1 from ${threadParticipants} tp
      where tp.thread_id = ${threads.id} and tp.user_id = ${userId}
    )
  )`;
}

export type ThreadSummary = {
  id: string;
  projectId: string;
  projectName: string | null;
  subject: string;
  status: string;
  isInternal: boolean;
  lastMessageAt: Date;
  messageCount: number;
  unread: number;
  lastMessage: string | null;
  lastAuthor: string | null;
  lastAuthorColor: string | null;
  participants: { name: string; avatarColor: string | null }[];
};

/**
 * Threads for one project (or across several, for the agency inbox), each with
 * an unread count relative to the viewer's last-read marker.
 */
export async function listThreads(
  userId: string,
  options: {
    projectId?: string;
    projectIds?: string[];
    includeInternal: boolean;
    status?: "OPEN" | "RESOLVED";
    limit?: number;
  },
): Promise<ThreadSummary[]> {
  const { projectId, projectIds, includeInternal, status, limit = 100 } = options;

  const clauses = [];
  if (projectId) clauses.push(eq(threads.projectId, projectId));
  else if (projectIds?.length) clauses.push(inArray(threads.projectId, projectIds));
  else return [];
  if (!includeInternal) clauses.push(eq(threads.isInternal, false));
  clauses.push(visibleToUser(userId));
  if (status) clauses.push(eq(threads.status, status));

  const rows = await db
    .select({
      id: threads.id,
      projectId: threads.projectId,
      projectName: projects.name,
      subject: threads.subject,
      status: threads.status,
      isInternal: threads.isInternal,
      lastMessageAt: threads.lastMessageAt,
      messageCount: sql<number>`(
        select count(*) from messages m where m.thread_id = ${threads.id}
      )`.mapWith(Number),
      unread: sql<number>`(
        select count(*) from messages m
        where m.thread_id = ${threads.id}
          and m.author_id is distinct from ${userId}
          and m.created_at > coalesce(
            (select tr.last_read_at from thread_reads tr
              where tr.thread_id = ${threads.id} and tr.user_id = ${userId}),
            'epoch'::timestamptz
          )
      )`.mapWith(Number),
      lastMessage: sql<string | null>`(
        select m.body from messages m
        where m.thread_id = ${threads.id}
        order by m.created_at desc limit 1
      )`,
      lastAuthor: sql<string | null>`(
        select u.name from messages m
        join users u on u.id = m.author_id
        where m.thread_id = ${threads.id}
        order by m.created_at desc limit 1
      )`,
      lastAuthorColor: sql<string | null>`(
        select u.avatar_color from messages m
        join users u on u.id = m.author_id
        where m.thread_id = ${threads.id}
        order by m.created_at desc limit 1
      )`,
    })
    .from(threads)
    .leftJoin(projects, eq(projects.id, threads.projectId))
    .where(and(...clauses))
    .orderBy(desc(threads.lastMessageAt))
    .limit(limit);

  if (!rows.length) return [];

  // Participants, in one extra round-trip rather than one per thread.
  const participantRows = await db
    .selectDistinct({
      threadId: messages.threadId,
      name: users.name,
      avatarColor: users.avatarColor,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(
      inArray(
        messages.threadId,
        rows.map((r) => r.id),
      ),
    );

  return rows.map((r) => ({
    ...r,
    participants: participantRows
      .filter((p) => p.threadId === r.id)
      .map((p) => ({ name: p.name, avatarColor: p.avatarColor })),
  }));
}

/**
 * @param viewerId enforces the participant rule. Required rather than optional
 *   so a new call site cannot quietly skip the check — this function is the
 *   gate every message read passes through.
 */
export async function getThread(threadId: string, viewerId: string) {
  const [row] = await db
    .select({
      id: threads.id,
      projectId: threads.projectId,
      projectName: projects.name,
      subject: threads.subject,
      status: threads.status,
      isInternal: threads.isInternal,
      createdAt: threads.createdAt,
      lastMessageAt: threads.lastMessageAt,
      createdByName: users.name,
    })
    .from(threads)
    .leftJoin(projects, eq(projects.id, threads.projectId))
    .leftJoin(users, eq(users.id, threads.createdById))
    .where(and(eq(threads.id, threadId), visibleToUser(viewerId)))
    .limit(1);
  return row ?? null;
}

export type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string | null;
  authorName: string;
  authorRole: string | null;
  authorColor: string | null;
  attachments: { name: string; url: string }[] | null;
};

export async function listMessages(threadId: string, limit = 300) {
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      editedAt: messages.editedAt,
      authorId: messages.authorId,
      authorName: sql<string>`coalesce(${users.name}, 'Removed user')`,
      authorRole: users.role,
      authorColor: users.avatarColor,
      attachments: messages.attachments,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt))
    .limit(limit);
  return rows as MessageRow[];
}

export async function markThreadRead(threadId: string, userId: string) {
  await db
    .insert(threadReads)
    .values({ threadId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [threadReads.threadId, threadReads.userId],
      set: { lastReadAt: new Date() },
    });
}

export async function countUnreadForThread(threadId: string, userId: string) {
  const [row] = await db
    .select({ value: count().mapWith(Number) })
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        sql`${messages.authorId} is distinct from ${userId}`,
        sql`${messages.createdAt} > coalesce(
          (select tr.last_read_at from thread_reads tr
            where tr.thread_id = ${threadId} and tr.user_id = ${userId}),
          'epoch'::timestamptz
        )`,
      ),
    );
  return row?.value ?? 0;
}
