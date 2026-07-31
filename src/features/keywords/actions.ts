"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { keywords } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { keywordSchema } from "@/lib/validations";

function revalidate(projectId: string) {
  revalidatePath(`/app/projects/${projectId}/keywords`);
  revalidatePath(`/app/projects/${projectId}/rankings`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/keywords");

  // Deleting a keyword takes its rank history with it.
  invalidate(projectId, "keywords", "rankings");
}

export async function saveKeywordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(keywordSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  const values = {
    projectId: input.projectId,
    keyword: input.keyword,
    intent: input.intent ?? null,
    volume: input.volume ?? null,
    kd: input.kd ?? null,
    cpc: input.cpc !== undefined ? String(input.cpc) : null,
    competition: input.competition ?? null,
    ads: input.ads ?? null,
    pageId: input.pageId ?? null,
    priority: input.priority,
    backlinkTarget: input.backlinkTarget ?? 0,
    monthlyTarget: input.monthlyTarget ?? null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db
        .update(keywords)
        .set(values)
        .where(and(eq(keywords.id, input.id), eq(keywords.projectId, input.projectId)));
    } else {
      await db.insert(keywords).values(values);
    }

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: input.id ? "updated" : "created",
      entity: "keyword",
      entityId: input.id ?? null,
      summary: `${input.id ? "Updated" : "Added"} keyword “${input.keyword}”`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(input.projectId);
  return ok(input.id ? "Keyword updated." : "Keyword added.");
}

export async function deleteKeywordAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  await db
    .delete(keywords)
    .where(and(eq(keywords.id, id), eq(keywords.projectId, projectId)));

  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "keyword",
    summary: "Deleted a keyword and its rank history",
  });

  revalidate(projectId);
}

export async function togglePriorityAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  await db
    .update(keywords)
    .set({ priority: sql`not ${keywords.priority}`, updatedAt: new Date() })
    .where(and(eq(keywords.id, id), eq(keywords.projectId, projectId)));

  revalidate(projectId);
}

export async function bulkUpdateKeywordsAction(
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
  if (!ids.length) return fail("Select at least one keyword first.");

  const scope = and(eq(keywords.projectId, projectId), inArray(keywords.id, ids));

  try {
    switch (operation) {
      case "prioritise":
        await db
          .update(keywords)
          .set({ priority: true, updatedAt: new Date() })
          .where(scope);
        break;
      case "deprioritise":
        await db
          .update(keywords)
          .set({ priority: false, updatedAt: new Date() })
          .where(scope);
        break;
      case "set-intent": {
        const intent = String(formData.get("intent") ?? "");
        if (!intent) return fail("Pick an intent.");
        await db.update(keywords).set({ intent, updatedAt: new Date() }).where(scope);
        break;
      }
      case "set-page": {
        const pageId = String(formData.get("pageId") ?? "");
        await db
          .update(keywords)
          .set({ pageId: pageId || null, updatedAt: new Date() })
          .where(scope);
        break;
      }
      case "set-target": {
        const target = Number(formData.get("backlinkTarget") ?? 0);
        if (!Number.isFinite(target) || target < 0) {
          return fail("Enter a valid backlink target.");
        }
        await db
          .update(keywords)
          .set({ backlinkTarget: Math.round(target), updatedAt: new Date() })
          .where(scope);
        break;
      }
      case "delete":
        await db.delete(keywords).where(scope);
        break;
      default:
        return fail("Unknown bulk action.");
    }

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: operation === "delete" ? "deleted" : "updated",
      entity: "keyword",
      summary: `Bulk ${operation.replace(/-/g, " ")} on ${ids.length} keyword${ids.length === 1 ? "" : "s"}`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(projectId);
  return ok(`${ids.length} keyword${ids.length === 1 ? "" : "s"} updated.`);
}
