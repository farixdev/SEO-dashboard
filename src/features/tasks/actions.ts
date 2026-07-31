"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { nextSortOrder } from "@/db/queries/tasks";
import { logActivity } from "@/db/queries/projects";
import { tasks } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireStaff } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { taskMoveSchema, taskSchema } from "@/lib/validations";

function revalidate(projectId: string) {
  invalidate(projectId, "tasks");
  revalidatePath(`/app/projects/${projectId}/tasks`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/progress");
}

export async function saveTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(taskSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  const values = {
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    category: input.category,
    assigneeId: input.assigneeId ?? null,
    dueDate: input.dueDate ?? null,
    clientVisible: input.clientVisible,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      /*
       * `completedAt` is when the work was finished, not when the row was last
       * touched. Re-stamping it on every save moved a task finished in March
       * into July's client report the moment someone fixed a typo — the report
       * at /portal/report buckets on this column. Only a change in status
       * moves it.
       */
      const [current] = await db
        .select({ status: tasks.status, completedAt: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.projectId, input.projectId)))
        .limit(1);

      const completedAt =
        input.status !== "DONE"
          ? null
          : current?.status === "DONE"
            ? (current.completedAt ?? new Date())
            : new Date();

      await db
        .update(tasks)
        .set({ ...values, completedAt })
        .where(and(eq(tasks.id, input.id), eq(tasks.projectId, input.projectId)));
    } else {
      await db.insert(tasks).values({
        ...values,
        completedAt: input.status === "DONE" ? new Date() : null,
        sortOrder: await nextSortOrder(input.projectId, input.status),
        createdById: user.id,
      });
    }

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: input.id ? "updated" : "created",
      entity: "task",
      entityId: input.id ?? null,
      summary: `${input.id ? "Updated" : "Created"} task “${input.title}”`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  revalidate(input.projectId);
  return ok(input.id ? "Task updated." : "Task created.");
}

/** Column change from the board. */
export async function moveTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const parsed = parseForm(taskMoveSchema, formData);
  if (!parsed.success) return;

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId || !user.projectIds.includes(projectId)) return;

  const [moved] = await db
    .update(tasks)
    .set({
      status: parsed.data.status,
      completedAt: parsed.data.status === "DONE" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, parsed.data.id), eq(tasks.projectId, projectId)))
    .returning({ title: tasks.title, status: tasks.status });

  if (moved) {
    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "updated",
      entity: "task",
      entityId: parsed.data.id,
      summary: `Moved “${moved.title}” to ${moved.status.toLowerCase().replace("_", " ")}`,
    });
  }

  revalidate(projectId);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId || !user.projectIds.includes(projectId)) return;

  const [removed] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.projectId, projectId)))
    .returning({ title: tasks.title });

  if (removed) {
    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "deleted",
      entity: "task",
      entityId: id,
      summary: `Deleted the deliverable “${removed.title}”`,
    });
  }

  revalidate(projectId);
}
