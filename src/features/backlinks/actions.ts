"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { backlinks } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { backlinkSchema } from "@/lib/validations";

function revalidate(projectId: string) {
  revalidatePath(`/app/projects/${projectId}/backlinks`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath(`/app/projects/${projectId}/team`);
  revalidatePath(`/portal`);
  revalidatePath(`/portal/backlinks`);
  // revalidatePath only clears the router cache; the data cache needs its tags.
  invalidate(projectId, "backlinks");
}

export async function saveBacklinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(backlinkSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  const values = {
    projectId: input.projectId,
    url: input.url,
    type: input.type,
    status: input.status,
    indexed: input.indexed,
    anchorText1: input.anchorText1 ?? null,
    anchorText2: input.anchorText2 ?? null,
    publishedDate: input.publishedDate ?? null,
    assigneeId: input.assigneeId ?? null,
    da: input.da ?? null,
    pa: input.pa ?? null,
    spamScore: input.spamScore ?? null,
    loginUser: input.loginUser ?? null,
    loginPassword: input.loginPassword ?? null,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      await db
        .update(backlinks)
        .set(values)
        .where(
          and(eq(backlinks.id, input.id), eq(backlinks.projectId, input.projectId)),
        );
    } else {
      await db.insert(backlinks).values(values);
    }

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: input.id ? "updated" : "created",
      entity: "backlink",
      entityId: input.id ?? null,
      summary: `${input.id ? "Updated" : "Added"} ${input.type.toLowerCase()} link ${input.url}`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(input.projectId);
  return ok(input.id ? "Backlink updated." : "Backlink added.");
}

export async function deleteBacklinkAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  await db
    .delete(backlinks)
    .where(and(eq(backlinks.id, id), eq(backlinks.projectId, projectId)));

  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "backlink",
    summary: "Deleted a backlink",
  });

  revalidate(projectId);
}

/** Bulk actions from the table's selection bar. */
export async function bulkUpdateBacklinksAction(
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
  if (!ids.length) return fail("Select at least one row first.");

  const scope = and(
    eq(backlinks.projectId, projectId),
    inArray(backlinks.id, ids),
  );

  try {
    switch (operation) {
      case "mark-indexed":
        await db
          .update(backlinks)
          .set({ indexed: true, updatedAt: new Date() })
          .where(scope);
        break;
      case "mark-not-indexed":
        await db
          .update(backlinks)
          .set({ indexed: false, updatedAt: new Date() })
          .where(scope);
        break;
      case "mark-published":
        await db
          .update(backlinks)
          .set({ status: "Published", updatedAt: new Date() })
          .where(scope);
        break;
      case "mark-pending":
        await db
          .update(backlinks)
          .set({ status: "Pending", updatedAt: new Date() })
          .where(scope);
        break;
      case "set-type": {
        const type = String(formData.get("type") ?? "");
        if (!type) return fail("Pick a link type.");
        await db.update(backlinks).set({ type, updatedAt: new Date() }).where(scope);
        break;
      }
      case "set-assignee": {
        const assigneeId = String(formData.get("assigneeId") ?? "");
        await db
          .update(backlinks)
          .set({ assigneeId: assigneeId || null, updatedAt: new Date() })
          .where(scope);
        break;
      }
      case "delete":
        await db.delete(backlinks).where(scope);
        break;
      default:
        return fail("Unknown bulk action.");
    }

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: operation === "delete" ? "deleted" : "updated",
      entity: "backlink",
      summary: `Bulk ${operation.replace(/-/g, " ")} on ${ids.length} link${ids.length === 1 ? "" : "s"}`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(projectId);
  return ok(`${ids.length} link${ids.length === 1 ? "" : "s"} updated.`);
}

/** Inline toggle straight from the table row. */
export async function toggleBacklinkIndexedAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  const [row] = await db
    .update(backlinks)
    .set({ indexed: sql`not ${backlinks.indexed}`, updatedAt: new Date() })
    .where(and(eq(backlinks.id, id), eq(backlinks.projectId, projectId)))
    .returning({ url: backlinks.url, indexed: backlinks.indexed });

  if (!row) return;

  // Getting a link indexed is the milestone that matters on this page, so it
  // belongs in the activity feed alongside every other backlink change.
  await logActivity({
    projectId,
    actorId: user.id,
    actorName: user.name,
    action: "updated",
    entity: "backlink",
    summary: `Marked ${row.url} as ${row.indexed ? "indexed" : "not indexed"}`,
  });

  revalidate(projectId);
}
