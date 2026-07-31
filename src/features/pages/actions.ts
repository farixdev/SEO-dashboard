"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { pages } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { pageSchema } from "@/lib/validations";

function revalidate(projectId: string) {
  invalidate(projectId, "pages");

  revalidatePath(`/app/projects/${projectId}/on-page`);
  revalidatePath(`/app/projects/${projectId}/keywords`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/on-page");
}

export async function savePageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(pageSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  const values = {
    projectId: input.projectId,
    title: input.title,
    targetUrl: input.targetUrl ?? null,
    focusKeyword: input.focusKeyword ?? null,
    type: input.type,
    onPageDone: input.onPageDone,
    seoScore: input.seoScore ?? null,
    indexed: input.indexed,
    wordCount: input.wordCount ?? null,
    hasFaqs: input.hasFaqs,
    hasBlogSection: input.hasBlogSection,
    hasReviewSection: input.hasReviewSection,
    hasCaseStudySection: input.hasCaseStudySection,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db
        .update(pages)
        .set(values)
        .where(and(eq(pages.id, input.id), eq(pages.projectId, input.projectId)));
    } else {
      // New pages land at the end of the list.
      const [row] = await db
        .select({ max: sql<number | null>`max(${pages.sortOrder})`.mapWith(Number) })
        .from(pages)
        .where(eq(pages.projectId, input.projectId));
      await db.insert(pages).values({ ...values, sortOrder: (row?.max ?? 0) + 10 });
    }

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: input.id ? "updated" : "created",
      entity: "page",
      entityId: input.id ?? null,
      summary: `${input.id ? "Updated" : "Added"} page “${input.title}”`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(input.projectId);
  return ok(input.id ? "Page updated." : "Page added.");
}

export async function deletePageAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  // Keywords mapped here are kept; their page_id is set to null by the FK rule.
  await db.delete(pages).where(and(eq(pages.id, id), eq(pages.projectId, projectId)));

  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "page",
    summary: "Deleted a page (its keywords were unmapped, not deleted)",
  });

  revalidate(projectId);
}

export async function togglePageFlagAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const field = String(formData.get("field") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  const COLUMNS = {
    onPageDone: pages.onPageDone,
    indexed: pages.indexed,
    hasFaqs: pages.hasFaqs,
    hasBlogSection: pages.hasBlogSection,
    hasReviewSection: pages.hasReviewSection,
    hasCaseStudySection: pages.hasCaseStudySection,
  } as const;

  const column = COLUMNS[field as keyof typeof COLUMNS];
  if (!column) return;

  await db
    .update(pages)
    .set({ [field]: sql`not ${column}`, updatedAt: new Date() })
    .where(and(eq(pages.id, id), eq(pages.projectId, projectId)));

  revalidate(projectId);
}

export async function bulkUpdatePagesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const operation = String(formData.get("operation") ?? "");
  const ids = formData.getAll("ids").map(String).filter(Boolean);

  if (!projectId || !user.projectIds.includes(projectId)) {
    return fail("You do not have access to that project.");
  }
  if (!ids.length) return fail("Select at least one page first.");

  const scope = and(eq(pages.projectId, projectId), inArray(pages.id, ids));

  try {
    switch (operation) {
      case "mark-optimised":
        await db.update(pages).set({ onPageDone: true, updatedAt: new Date() }).where(scope);
        break;
      case "mark-pending":
        await db.update(pages).set({ onPageDone: false, updatedAt: new Date() }).where(scope);
        break;
      case "mark-indexed":
        await db.update(pages).set({ indexed: true, updatedAt: new Date() }).where(scope);
        break;
      case "set-type": {
        const type = String(formData.get("type") ?? "");
        if (!type) return fail("Pick a page type.");
        await db.update(pages).set({ type, updatedAt: new Date() }).where(scope);
        break;
      }
      case "set-score": {
        const score = String(formData.get("seoScore") ?? "");
        await db
          .update(pages)
          .set({ seoScore: score || null, updatedAt: new Date() })
          .where(scope);
        break;
      }
      case "delete":
        await db.delete(pages).where(scope);
        break;
      default:
        return fail("Unknown bulk action.");
    }
    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: operation === "delete" ? "deleted" : "updated",
      entity: "page",
      summary: `Bulk ${operation.replace(/-/g, " ")} on ${ids.length} page${ids.length === 1 ? "" : "s"}`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(projectId);
  return ok(`${ids.length} page${ids.length === 1 ? "" : "s"} updated.`);
}
