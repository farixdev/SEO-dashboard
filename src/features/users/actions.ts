"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { projectMembers, users } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import { generatePassword, hashPassword, requireAdmin } from "@/lib/auth";
import { invalidateUsers } from "@/lib/cache";
import {
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validations";

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ password: string; email: string }>> {
  const admin = await requireAdmin();
  const parsed = parseForm(userCreateSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;

  // A client account without a project would have nothing to sign in to.
  if (input.role === "CLIENT" && !input.projectId) {
    return fail("Pick the project this client should see.", {
      projectId: "Required for client accounts",
    });
  }

  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, input.email.toLowerCase()))
      .limit(1);
    if (existing) {
      return fail("That email address is already in use.", {
        email: "Already registered",
      });
    }

    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        title: input.title ?? null,
        phone: input.phone ?? null,
        avatarColor: input.role === "CLIENT" ? "sky" : "indigo",
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    if (input.role === "CLIENT" && input.projectId) {
      await db.insert(projectMembers).values({
        projectId: input.projectId,
        userId: created.id,
        role: "CLIENT_VIEWER",
      });
    }

    await logActivity({
      projectId: input.role === "CLIENT" ? input.projectId : null,
      actorId: admin.id,
      actorName: admin.name,
      action: "created",
      entity: "user",
      entityId: created.id,
      summary: `Created ${input.role.toLowerCase()} account for ${input.email}`,
    });

    invalidateUsers();

    revalidatePath("/app/team");
    return ok("Account created.", {
      password: input.password,
      email: input.email,
    });
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(userUpdateSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;

  // Do not let an admin lock themselves out.
  if (input.id === admin.id && (input.role !== "ADMIN" || !input.isActive)) {
    return fail("You cannot remove your own admin access.");
  }

  try {
    await db
      .update(users)
      .set({
        name: input.name,
        email: input.email,
        role: input.role,
        title: input.title ?? null,
        phone: input.phone ?? null,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.id));

    await logActivity({
      actorId: admin.id,
      actorName: admin.name,
      action: "updated",
      entity: "user",
      entityId: input.id,
      summary: `Updated account ${input.email}`,
    });

    invalidateUsers();

    revalidatePath("/app/team");
    return ok("Account saved.");
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ password: string }>> {
  const admin = await requireAdmin();

  // A blank password field means "generate one for me".
  const requested = String(formData.get("password") ?? "").trim();
  const password = requested || generatePassword();
  const id = String(formData.get("id") ?? "");

  const parsed = parseForm(resetPasswordSchema, (() => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("password", password);
    return fd;
  })());
  if (!parsed.success) return fail("Check the password.", parsed.errors);

  try {
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.id));

    await logActivity({
      actorId: admin.id,
      actorName: admin.name,
      action: "updated",
      entity: "user",
      entityId: parsed.data.id,
      summary: `Reset the password for a user account`,
    });

    invalidateUsers();

    revalidatePath("/app/team");
    return ok("Password reset. Share it with the user.", { password });
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return;

  const [changed] = await db
    .update(users)
    .set({ isActive: sql`not ${users.isActive}`, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ email: users.email, isActive: users.isActive });

  if (changed) {
    await logActivity({
      actorId: admin.id,
      actorName: admin.name,
      action: "updated",
      entity: "user",
      entityId: id,
      summary: `${changed.isActive ? "Reactivated" : "Deactivated"} the account ${changed.email}`,
    });
  }

  invalidateUsers();

  revalidatePath("/app/team");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return;

  const [target] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  await db.delete(users).where(eq(users.id, id));

  await logActivity({
    actorId: admin.id,
    actorName: admin.name,
    action: "deleted",
    entity: "user",
    summary: `Deleted account ${target?.email ?? id}`,
  });

  invalidateUsers();

  revalidatePath("/app/team");
}
