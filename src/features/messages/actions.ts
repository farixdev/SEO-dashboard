"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { getThread, markThreadRead } from "@/db/queries/messages";
import { logActivity } from "@/db/queries/projects";
import { messages, threads } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { messageCreateSchema, threadCreateSchema } from "@/lib/validations";

function revalidate(projectId: string, isStaff: boolean) {
  if (isStaff) {
    revalidatePath(`/app/projects/${projectId}/messages`);
    revalidatePath("/app/inbox");
    revalidatePath("/app");
  } else {
    revalidatePath("/portal/messages");
    revalidatePath("/portal");
  }
  // revalidatePath only clears the router cache; the data cache needs its tags.
  invalidate(projectId, "threads");
}

export async function createThreadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ threadId: string }>> {
  const user = await requireUser();
  const parsed = parseForm(threadCreateSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.projectId)) {
    return fail("You do not have access to that project.");
  }

  // Clients must never be able to open an internal-only thread.
  const isInternal = user.role === "CLIENT" ? false : input.isInternal;

  try {
    const [thread] = await db
      .insert(threads)
      .values({
        projectId: input.projectId,
        subject: input.subject,
        isInternal,
        createdById: user.id,
      })
      .returning({ id: threads.id });

    await db.insert(messages).values({
      threadId: thread.id,
      authorId: user.id,
      body: input.body,
    });

    await markThreadRead(thread.id, user.id);

    await logActivity({
      projectId: input.projectId,
      actorId: user.id,
      actorName: user.name,
      action: "created",
      entity: "thread",
      entityId: thread.id,
      summary: `Started conversation “${input.subject}”`,
    });

    revalidate(input.projectId, user.role !== "CLIENT");
    return ok("Conversation started.", { threadId: thread.id });
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function sendMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(messageCreateSchema, formData);
  if (!parsed.success) return fail("Write a message first.", parsed.errors);

  try {
    const thread = await getThread(parsed.data.threadId);
    if (!thread || !user.projectIds.includes(thread.projectId)) {
      return fail("That conversation is not available.");
    }
    if (thread.isInternal && user.role === "CLIENT") {
      return fail("That conversation is not available.");
    }

    await db.insert(messages).values({
      threadId: thread.id,
      authorId: user.id,
      body: parsed.data.body,
    });

    await db
      .update(threads)
      .set({ lastMessageAt: new Date(), status: "OPEN" })
      .where(eq(threads.id, thread.id));

    await markThreadRead(thread.id, user.id);

    revalidate(thread.projectId, user.role !== "CLIENT");
    return ok();
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function markThreadReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  if (!threadId) return;

  const thread = await getThread(threadId);
  if (!thread || !user.projectIds.includes(thread.projectId)) return;

  await markThreadRead(threadId, user.id);
  // Read receipts move the unread badge, which is read through project caches.
  invalidate(thread.projectId, "threads");
}

export async function toggleThreadStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  if (!threadId) return;

  const thread = await getThread(threadId);
  if (!thread || !user.projectIds.includes(thread.projectId)) return;

  await db
    .update(threads)
    .set({
      status: sql`case when ${threads.status} = 'OPEN' then 'RESOLVED' else 'OPEN' end`,
    })
    .where(eq(threads.id, threadId));

  revalidate(thread.projectId, user.role !== "CLIENT");
}

export async function deleteThreadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  // Only the agency side can remove a conversation.
  if (user.role === "CLIENT") return;

  const threadId = String(formData.get("threadId") ?? "");
  if (!threadId) return;

  const thread = await getThread(threadId);
  if (!thread || !user.projectIds.includes(thread.projectId)) return;

  await db.delete(threads).where(eq(threads.id, threadId));

  await logActivity({
    projectId: thread.projectId,
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "thread",
    entityId: threadId,
    summary: `Deleted the conversation “${thread.subject}” and every message in it`,
  });

  revalidate(thread.projectId, true);
}
