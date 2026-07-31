import { timingSafeEqual } from "node:crypto";

import { and, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { activityLog, users } from "@/db/schema";
import { invalidateUsers } from "@/lib/cache";

/* ════════════════════════════════════════════════════════════════
   Scheduled maintenance.

   Nothing in this app ran on a timer, so housekeeping only happened
   when a person remembered. Point any scheduler at:

     POST /api/cron/sweep-invites     daily
     POST /api/cron/prune-activity    monthly

   with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET set,
   every job refuses to run rather than being open to the internet.
   ════════════════════════════════════════════════════════════════ */

/** How long an audit entry is kept. Deletions and imports are kept longer. */
const ROUTINE_RETENTION_DAYS = 180;
const NOTABLE_RETENTION_DAYS = 730;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Clears invite tokens that have lapsed without being accepted.
 *
 * The hash is useless once expired — `checkInvite` refuses it either way —
 * but leaving it behind means the team page keeps showing a "pending invite"
 * that will never work, and the row keeps a credential-shaped value forever.
 */
async function sweepInvites() {
  const swept = await db
    .update(users)
    .set({ inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        isNotNull(users.inviteTokenHash),
        isNull(users.inviteAcceptedAt),
        lt(users.inviteExpiresAt, new Date()),
      ),
    )
    .returning({ email: users.email });

  if (swept.length) {
    await logActivity({
      actorName: "Scheduled maintenance",
      action: "deleted",
      entity: "invite",
      summary: `Cleared ${swept.length} expired invite link${swept.length === 1 ? "" : "s"}`,
    });
    invalidateUsers();
  }

  return { swept: swept.length, accounts: swept.map((s) => s.email) };
}

/** Keeps the audit trail from growing without bound. */
async function pruneActivity() {
  const removed = await db
    .delete(activityLog)
    .where(
      sql`case when ${activityLog.action} in ('deleted', 'imported')
            then ${activityLog.createdAt} < now() - interval '${sql.raw(String(NOTABLE_RETENTION_DAYS))} days'
            else ${activityLog.createdAt} < now() - interval '${sql.raw(String(ROUTINE_RETENTION_DAYS))} days'
          end`,
    )
    .returning({ id: activityLog.id });

  return { removed: removed.length };
}

const JOBS: Record<string, () => Promise<unknown>> = {
  "sweep-invites": sweepInvites,
  "prune-activity": pruneActivity,
};

async function handle(
  request: NextRequest,
  params: Promise<{ job: string }>,
) {
  if (!authorised(request)) {
    // Same answer whether the secret is unset, wrong, or the job is unknown.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { job } = await params;
  const run = JOBS[job];
  if (!run) {
    return NextResponse.json(
      { error: "Unknown job", available: Object.keys(JOBS) },
      { status: 404 },
    );
  }

  try {
    const result = await run();
    return NextResponse.json({ job, ok: true, ...(result as object) });
  } catch (error) {
    return NextResponse.json(
      { job, ok: false, error: error instanceof Error ? error.message : "Job failed" },
      { status: 500 },
    );
  }
}

/**
 * Vercel Cron invokes with **GET** and sends `Authorization: Bearer $CRON_SECRET`
 * automatically when that variable is set on the project. POST is kept so the
 * jobs can also be triggered by hand or by any other scheduler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  return handle(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  return handle(request, params);
}
