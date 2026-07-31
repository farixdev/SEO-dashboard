"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { logActivity } from "@/db/queries/projects";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import {
  getCurrentUser,
  hashPassword,
  login as performLogin,
  logout as clearSession,
  verifyPassword,
} from "@/lib/auth";
import { invalidateUsers } from "@/lib/cache";
import { changePasswordSchema, loginSchema } from "@/lib/validations";

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) {
    return fail("Check the fields below.", parsed.errors);
  }

  let destination: string;
  try {
    const result = await performLogin(parsed.data.email, parsed.data.password);
    if (!result.ok) return fail(result.error);

    const next = parsed.data.next;
    // Only follow same-origin relative paths, and only into the right house.
    const safeNext =
      next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      (result.role === "CLIENT"
        ? next.startsWith("/portal")
        : next.startsWith("/app"))
        ? next
        : result.redirectTo;

    destination = safeNext;

    // login() stamps lastLoginAt, which the team and member tables display.
    invalidateUsers();

    // The id comes from the row login() actually authenticated, not from the
    // address typed into the form — otherwise a sign-in can never be
    // attributed to an account, and the audit row records whatever was typed.
    await logActivity({
      actorId: result.userId,
      actorName: result.name,
      action: "logged_in",
      entity: "session",
      summary: `${result.name} signed in`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  // redirect() throws, so it must sit outside the try block.
  redirect(destination);
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired. Sign in again.");

  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  try {
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return fail("Your current password is incorrect.", {
        currentPassword: "Incorrect password",
      });
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logActivity({
      actorId: user.id,
      actorName: user.name,
      action: "updated",
      entity: "password",
      summary: `${user.name} changed their password`,
    });

    invalidateUsers();

    return ok("Password updated.");
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session expired. Sign in again.");

  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const avatarColor = String(formData.get("avatarColor") ?? "").trim();

  if (name.length < 2) {
    return fail("Enter your name.", { name: "Name is required" });
  }

  try {
    await db
      .update(users)
      .set({
        name,
        title: title || null,
        phone: phone || null,
        avatarColor: avatarColor || user.avatarColor,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    invalidateUsers();

    return ok("Profile saved.");
  } catch (error) {
    return fail(describeError(error));
  }
}
