import "server-only";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { messages, projects, threadReads, threads, users } from "@/db/schema";

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

export async function getThread(threadId: string) {
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
    .where(eq(threads.id, threadId))
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
