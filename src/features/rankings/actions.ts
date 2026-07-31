"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { keywords, rankings } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { monthKey, monthLabel, positionToPage, toNumber } from "@/lib/utils";

function revalidate(projectId: string) {
  revalidatePath(`/app/projects/${projectId}/rankings`);
  revalidatePath(`/app/projects/${projectId}/keywords`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/rankings");
  // revalidatePath only clears the router cache; cached aggregates are
  // tag-scoped and need their own sweep.
  invalidate(projectId, "rankings");
}

/**
 * Saves a whole month of positions in one round-trip. The grid posts
 * `position-<keywordId>` fields; blank means "not ranking", which deletes the
 * row rather than storing a zero.
 */
export async function saveMonthRankingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const monthInput = String(formData.get("month") ?? "");
  const checkedOn = String(formData.get("checkedOn") ?? "").trim() || null;

  if (!projectId || !user.projectIds.includes(projectId)) {
    return fail("You do not have access to that project.");
  }
  const month = monthKey(monthInput.length === 7 ? `${monthInput}-01` : monthInput);
  if (!month) return fail("Pick the month these positions belong to.");

  /*
   * The month comes from the page; the check date is typed. Left unchecked,
   * a June grid could be stamped "checked 15 August" — the row files under
   * June while every screen that shows the stamp says August. The picker is
   * bounded too, but that is only a hint: nothing stops a crafted post.
   */
  if (checkedOn) {
    if (monthKey(checkedOn) !== month) {
      return fail(
        `The check date must fall inside ${monthLabel(month)}. Switch month, or correct the date.`,
      );
    }
    if (checkedOn > new Date().toISOString().slice(0, 10)) {
      return fail("The check date cannot be in the future.");
    }
  }

  const upserts: {
    projectId: string;
    keywordId: string;
    month: string;
    checkedOn: string | null;
    position: number;
    page: number;
  }[] = [];
  const clears: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("position-")) continue;
    const keywordId = key.slice("position-".length);
    const value = String(raw).trim();

    if (value === "") {
      clears.push(keywordId);
      continue;
    }

    const position = toNumber(value);
    if (position === null || position <= 0) {
      clears.push(keywordId);
      continue;
    }

    // The sheet stored the SERP page alongside the position; derive it so the
    // two can never drift apart.
    const explicitPage = toNumber(formData.get(`page-${keywordId}`));
    upserts.push({
      projectId,
      keywordId,
      month,
      checkedOn,
      position,
      page: explicitPage ?? positionToPage(position) ?? 1,
    });
  }

  try {
    // Only touch keywords that really belong to this project.
    const ids = [...upserts.map((u) => u.keywordId), ...clears];
    if (ids.length) {
      const owned = await db
        .select({ id: keywords.id })
        .from(keywords)
        .where(and(eq(keywords.projectId, projectId), inArray(keywords.id, ids)));
      const ownedSet = new Set(owned.map((o) => o.id));

      const validUpserts = upserts.filter((u) => ownedSet.has(u.keywordId));
      const validClears = clears.filter((id) => ownedSet.has(id));

      if (validUpserts.length) {
        // Chunked so a 779-keyword project stays inside statement limits.
        for (let i = 0; i < validUpserts.length; i += 500) {
          await db
            .insert(rankings)
            .values(validUpserts.slice(i, i + 500))
            .onConflictDoUpdate({
              target: [rankings.keywordId, rankings.month],
              set: {
                position: sql`excluded.position`,
                page: sql`excluded.page`,
                checkedOn: sql`excluded.checked_on`,
              },
            });
        }
      }

      if (validClears.length) {
        for (let i = 0; i < validClears.length; i += 500) {
          await db
            .delete(rankings)
            .where(
              and(
                eq(rankings.month, month),
                inArray(rankings.keywordId, validClears.slice(i, i + 500)),
              ),
            );
        }
      }

      await logActivity({
        projectId,
        actorId: user.id,
        actorName: user.name,
        action: "updated",
        entity: "ranking",
        summary: `Saved ${validUpserts.length} position${validUpserts.length === 1 ? "" : "s"} for ${month.slice(0, 7)}`,
      });
    }
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(projectId);
  return ok(`Saved ${upserts.length} position${upserts.length === 1 ? "" : "s"}.`);
}

export async function deleteMonthRankingsAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!projectId || !month || !user.projectIds.includes(projectId)) return;

  await db
    .delete(rankings)
    .where(and(eq(rankings.projectId, projectId), eq(rankings.month, month)));

  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "ranking",
    summary: `Cleared all positions for ${month.slice(0, 7)}`,
  });

  revalidate(projectId);
}
