import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { backlinks, users } from "@/db/schema";
import { CACHE_TTL, cachedQuery, tags } from "@/lib/cache";
import type { ListQuery } from "@/lib/query";
import { addMonths } from "@/lib/utils";

/* Columns the client portal is allowed to see. Login credentials live on the
   same row, so every client-facing read goes through this projection. */
const PUBLIC_COLUMNS = {
  id: backlinks.id,
  url: backlinks.url,
  type: backlinks.type,
  status: backlinks.status,
  indexed: backlinks.indexed,
  anchorText1: backlinks.anchorText1,
  anchorText2: backlinks.anchorText2,
  publishedDate: backlinks.publishedDate,
  da: backlinks.da,
  pa: backlinks.pa,
  spamScore: backlinks.spamScore,
  assigneeName: sql<string | null>`null`,
  assigneeId: sql<string | null>`null`,
  loginUser: sql<string | null>`null`,
  loginPassword: sql<string | null>`null`,
  notes: sql<string | null>`null`,
  createdAt: backlinks.createdAt,
} as const;

const STAFF_COLUMNS = {
  id: backlinks.id,
  url: backlinks.url,
  type: backlinks.type,
  status: backlinks.status,
  indexed: backlinks.indexed,
  anchorText1: backlinks.anchorText1,
  anchorText2: backlinks.anchorText2,
  publishedDate: backlinks.publishedDate,
  da: backlinks.da,
  pa: backlinks.pa,
  spamScore: backlinks.spamScore,
  assigneeId: backlinks.assigneeId,
  assigneeName: sql<string | null>`coalesce(${users.name}, ${backlinks.assigneeName})`,
  loginUser: backlinks.loginUser,
  loginPassword: backlinks.loginPassword,
  notes: backlinks.notes,
  createdAt: backlinks.createdAt,
} as const;

export type BacklinkRow = {
  id: string;
  url: string;
  type: string;
  status: string;
  indexed: boolean;
  anchorText1: string | null;
  anchorText2: string | null;
  publishedDate: string | null;
  da: number | null;
  pa: number | null;
  spamScore: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  loginUser: string | null;
  loginPassword: string | null;
  notes: string | null;
  createdAt: Date;
};

const SORTABLE = {
  publishedDate: backlinks.publishedDate,
  url: backlinks.url,
  type: backlinks.type,
  status: backlinks.status,
  da: backlinks.da,
  pa: backlinks.pa,
  spamScore: backlinks.spamScore,
  indexed: backlinks.indexed,
  createdAt: backlinks.createdAt,
} as const;

function buildWhere(projectId: string, query: ListQuery) {
  const clauses: (SQL | undefined)[] = [eq(backlinks.projectId, projectId)];
  const { q, filters } = query;

  if (q) {
    const like = `%${q}%`;
    clauses.push(
      or(
        ilike(backlinks.url, like),
        ilike(backlinks.anchorText1, like),
        ilike(backlinks.anchorText2, like),
        ilike(backlinks.notes, like),
      ),
    );
  }
  if (filters.type) clauses.push(eq(backlinks.type, filters.type));
  if (filters.status) clauses.push(eq(backlinks.status, filters.status));
  if (filters.indexed === "yes") clauses.push(eq(backlinks.indexed, true));
  if (filters.indexed === "no") clauses.push(eq(backlinks.indexed, false));
  if (filters.assignee) {
    clauses.push(
      filters.assignee === "unassigned"
        ? isNull(backlinks.assigneeId)
        : eq(backlinks.assigneeId, filters.assignee),
    );
  }
  if (filters.month) {
    clauses.push(
      and(
        gte(backlinks.publishedDate, filters.month),
        sql`${backlinks.publishedDate} < ${addMonths(filters.month, 1)}`,
      ),
    );
  }
  if (filters.from) clauses.push(gte(backlinks.publishedDate, filters.from));
  if (filters.to) clauses.push(lte(backlinks.publishedDate, filters.to));
  if (filters.minDa) clauses.push(gte(backlinks.da, Number(filters.minDa)));
  if (filters.maxSpam) clauses.push(lte(backlinks.spamScore, Number(filters.maxSpam)));
  if (filters.anchor === "missing") {
    clauses.push(and(isNull(backlinks.anchorText1), isNull(backlinks.anchorText2)));
  }
  if (filters.anchor === "present") clauses.push(isNotNull(backlinks.anchorText1));

  return and(...clauses.filter(Boolean));
}

async function uncachedListBacklinks(
  projectId: string,
  query: ListQuery,
  options: { includeSecrets?: boolean } = {},
) {
  const where = buildWhere(projectId, query);
  const sortColumn = SORTABLE[query.sort as keyof typeof SORTABLE] ?? backlinks.publishedDate;
  const direction = query.dir === "asc" ? asc : desc;

  const columns = options.includeSecrets ? STAFF_COLUMNS : PUBLIC_COLUMNS;

  const base = db
    .select(columns)
    .from(backlinks)
    .where(where)
    // The published date is nullable, so a secondary key keeps paging stable.
    .orderBy(direction(sortColumn), desc(backlinks.createdAt), asc(backlinks.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const rowsPromise = options.includeSecrets
    ? base.leftJoin(users, eq(users.id, backlinks.assigneeId))
    : base;

  const [rows, totals] = await Promise.all([
    rowsPromise,
    db
      .select({
        total: count().mapWith(Number),
        published: sql<number>`count(*) filter (where ${backlinks.status} = 'Published')`.mapWith(
          Number,
        ),
        indexed: sql<number>`count(*) filter (where ${backlinks.indexed})`.mapWith(
          Number,
        ),
        avgDa: sql<number | null>`avg(${backlinks.da})`.mapWith(Number),
        avgSpam: sql<number | null>`avg(${backlinks.spamScore})`.mapWith(Number),
      })
      .from(backlinks)
      .where(where),
  ]);

  return {
    rows: rows as unknown as BacklinkRow[],
    total: totals[0]?.total ?? 0,
    summary: {
      published: totals[0]?.published ?? 0,
      indexed: totals[0]?.indexed ?? 0,
      avgDa: totals[0]?.avgDa ?? null,
      avgSpam: totals[0]?.avgSpam ?? null,
    },
  };
}

/**
 * Cached: the table itself is the slowest query on the page, and it only
 * changes when someone edits data — which always invalidates these tags.
 */
export const listBacklinks = cachedQuery(
  "backlinks:listBacklinks",
  uncachedListBacklinks,
  (projectId: string, _query: ListQuery, _options?: { includeSecrets?: boolean }) => [
    tags.project(projectId),
    tags.users(),
  ],
  CACHE_TTL.aggregate,
);


export async function getBacklink(projectId: string, id: string) {
  const [row] = await db
    .select(STAFF_COLUMNS)
    .from(backlinks)
    .leftJoin(users, eq(users.id, backlinks.assigneeId))
    .where(and(eq(backlinks.projectId, projectId), eq(backlinks.id, id)))
    .limit(1);
  return (row as unknown as BacklinkRow) ?? null;
}

/** Distinct assignees on this project, for the filter dropdown. */
async function uncachedGetBacklinkAssignees(projectId: string) {
  const rows = await db
    .select({
      id: backlinks.assigneeId,
      name: sql<string>`coalesce(${users.name}, ${backlinks.assigneeName}, 'Unassigned')`,
      value: count().mapWith(Number),
    })
    .from(backlinks)
    .leftJoin(users, eq(users.id, backlinks.assigneeId))
    .where(eq(backlinks.projectId, projectId))
    .groupBy(backlinks.assigneeId, users.name, backlinks.assigneeName)
    .orderBy(desc(count()));
  return rows;
}

export const getBacklinkAssignees = cachedQuery(
  "backlinks:get-backlink-assignees",
  uncachedGetBacklinkAssignees,
  (projectId) => [
    tags.project(projectId),
    tags.backlinks(projectId),
    // Display names come from the joined users row, so renaming a user
    // must refresh this list too.
    tags.users(),
  ],
  CACHE_TTL.reference,
);

/** Duplicate-URL guard used by the importer and the create form. */
export async function findExistingBacklinkUrls(projectId: string, urls: string[]) {
  if (!urls.length) return new Set<string>();
  const rows = await db
    .select({ url: backlinks.url })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.projectId, projectId),
        sql`${backlinks.url} = any(${sql.param(urls)}::text[])`,
      ),
    );
  return new Set(rows.map((r) => r.url));
}
