"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { analyticsSnapshots } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { monthKey, monthLabel } from "@/lib/utils";
import { analyticsSchema } from "@/lib/validations";

function revalidate(projectId: string) {
  invalidate(projectId, "analytics");
  revalidatePath(`/app/projects/${projectId}/analytics`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/analytics");
}

export async function saveAnalyticsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(analyticsSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  const month = monthKey(
    input.month.length === 7 ? `${input.month}-01` : input.month,
  );
  if (!month) return fail("Enter a valid month.", { month: "Use YYYY-MM" });

  // "1000+" style labels are kept verbatim; the numeric column takes the digits.
  const label = input.keywordCountLabel ?? null;
  const keywordCount =
    input.keywordCount ??
    (label ? Number(label.replace(/[^0-9]/g, "")) || null : null);

  const values = {
    projectId: input.projectId,
    month,
    capturedOn: input.capturedOn ?? null,
    country: input.country,
    clicks: input.clicks ?? 0,
    impressions: input.impressions ?? 0,
    keywordCount,
    keywordCountLabel: label,
    gaTraffic: input.gaTraffic ?? null,
    avgPosition: input.avgPosition ?? null,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db
        .update(analyticsSnapshots)
        .set(values)
        .where(
          and(
            eq(analyticsSnapshots.id, input.id),
            eq(analyticsSnapshots.projectId, input.projectId),
          ),
        );
    } else {
      // One row per (project, month, country) — re-entering a month updates it.
      await db
        .insert(analyticsSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [
            analyticsSnapshots.projectId,
            analyticsSnapshots.month,
            analyticsSnapshots.country,
          ],
          set: {
            clicks: sql`excluded.clicks`,
            impressions: sql`excluded.impressions`,
            keywordCount: sql`excluded.keyword_count`,
            keywordCountLabel: sql`excluded.keyword_count_label`,
            gaTraffic: sql`excluded.ga_traffic`,
            avgPosition: sql`excluded.avg_position`,
            capturedOn: sql`excluded.captured_on`,
            notes: sql`excluded.notes`,
            updatedAt: new Date(),
          },
        });
    }

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: input.id ? "updated" : "created",
      entity: "analytics",
      summary: `Recorded Search Console data for ${month.slice(0, 7)}`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(input.projectId);
  return ok("Monthly data saved.");
}

export async function deleteAnalyticsAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  const [removed] = await db
    .delete(analyticsSnapshots)
    .where(
      and(
        eq(analyticsSnapshots.id, id),
        eq(analyticsSnapshots.projectId, projectId),
      ),
    )
    .returning({ month: analyticsSnapshots.month });

  if (!removed) return;

  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "analytics",
    entityId: id,
    summary: `Deleted the Search Console figures for ${monthLabel(removed.month)}`,
  });

  revalidate(projectId);
}
