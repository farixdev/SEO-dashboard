"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
import { hashPassword, refreshSession, requireStaff } from "@/lib/auth";
import { invalidateUsers } from "@/lib/cache";
import {
  checkInvite,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  parseInviteDuration,
  inviteTokenMatches,
  inviteUrl,
} from "@/lib/invite";
import { acceptInviteSchema, setPasswordSchema } from "@/lib/validations";

/* ── Issue ─────────────────────────────────────────────────────── */

/**
 * Creates a fresh invite link for an account and returns the URL once.
 * Generating a new link invalidates any previous one, which is what you
 * want if a link was sent to the wrong address.
 */
/**
 * Whether `staff` is allowed to act on someone else's account.
 *
 * Admins manage everyone, including accounts not yet attached to a project.
 * Anyone else may only touch accounts they actually share a project with —
 * without this an invite is a full account takeover of any client in the
 * agency, because the caller gets the working sign-in link back.
 */
async function canManageAccount(
  staff: { id: string; role: string; projectIds: string[] },
  targetId: string,
): Promise<boolean> {
  if (staff.role === "ADMIN") return true;
  if (staff.id === targetId) return true;
  if (staff.projectIds.length === 0) return false;

  const shared = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.userId, targetId),
        inArray(projectMembers.projectId, staff.projectIds),
      ),
    )
    .limit(1);

  return shared.length > 0;
}

export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ url: string; email: string; expiresAt: string | null }>> {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return fail("Pick an account first.");

  if (!(await canManageAccount(staff, userId))) {
    return fail("That account is not on one of your projects.");
  }

  try {
    const [target] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target) return fail("That account no longer exists.");
    if (!target.isActive) {
      return fail("That account is deactivated — reactivate it before inviting.");
    }
    // Only an admin may hand out access to another staff member.
    if (target.role !== "CLIENT" && staff.role !== "ADMIN") {
      return fail("Only an admin can invite team members.");
    }

    const token = generateInviteToken();
    // Whoever issues the link chooses how long it lives; the value is parsed
    // against the allowed set rather than trusted off the form.
    const expiresAt = inviteExpiry(parseInviteDuration(formData.get("expiresInDays")));

    await db
      .update(users)
      .set({
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: expiresAt,
        inviteAcceptedAt: null,
        // Until they accept, the account should not be usable with an old
        // password someone may still have written down.
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logActivity({
      actorId: staff.id,
      actorName: staff.name,
      action: "created",
      entity: "invite",
      entityId: userId,
      summary: `Created an invite link for ${target.email} (${
        expiresAt ? `expires ${expiresAt.toISOString().slice(0, 10)}` : "never expires"
      })`,
    });

    invalidateUsers();
    revalidatePath("/app/team");

    return ok(
      expiresAt
        ? "Invite link ready."
        : "Invite link ready — it will not expire.",
      {
        url: inviteUrl(token),
        email: target.email,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    );
  } catch (error) {
    return fail(describeError(error));
  }
}

/** Cancels an outstanding invite without touching the account. */
export async function revokeInviteAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  // Same scoping as issuing one — otherwise anyone could kill the link a new
  // admin is waiting on, silently.
  if (!(await canManageAccount(staff, userId))) return;

  await db
    .update(users)
    .set({ inviteTokenHash: null, inviteExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNotNull(users.inviteTokenHash)));

  await logActivity({
    actorId: staff.id,
    actorName: staff.name,
    action: "deleted",
    entity: "invite",
    entityId: userId,
    summary: "Revoked an invite link",
  });

  invalidateUsers();
  revalidatePath("/app/team");
}

/* ── Redeem ────────────────────────────────────────────────────── */

/**
 * The client sets their own password and is signed straight in. The token
 * is consumed here, so the link cannot be reused if it is forwarded on.
 */
export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(acceptInviteSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const { token, password } = parsed.data;
  let destination = "/portal";

  try {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.inviteTokenHash, hashInviteToken(token)))
      .limit(1);

    // Re-verify in constant time; the lookup above is only an index probe.
    if (!row || !row.inviteTokenHash || !inviteTokenMatches(token, row.inviteTokenHash)) {
      return fail("This invite link is not valid. Ask your contact for a new one.");
    }

    const state = checkInvite(row);
    if (!state.valid) {
      const message =
        state.reason === "used"
          ? "This invite has already been used. Sign in with your password instead."
          : state.reason === "expired"
            ? "This invite link has expired. Ask your contact to send a new one."
            : "This account is not active. Contact your account manager.";
      return fail(message);
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        // The hash is kept, not cleared: it is one-way, `checkInvite` refuses
        // any row that has been accepted, and keeping it lets someone who
        // re-opens their old link read "you have already set this up" instead
        // of a dead-end "invalid link". Revoking still nulls it.
        inviteExpiresAt: null,
        inviteAcceptedAt: new Date(),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.id));

    await logActivity({
      actorId: row.id,
      actorName: row.name,
      action: "updated",
      entity: "invite",
      entityId: row.id,
      summary: `${row.name} accepted their invite and set a password`,
    });

    invalidateUsers();

    // Sign them in so the link lands them straight on their dashboard.
    await refreshSession(row.id);
    destination = row.role === "CLIENT" ? "/portal" : "/app";
  } catch (error) {
    return fail(describeError(error));
  }

  redirect(destination);
}

/* ── Forced password change ────────────────────────────────────── */

/**
 * Used by the blocking screen shown to anyone still on a password someone
 * else chose for them.
 */
export async function setOwnPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { getCurrentUser, refreshSession } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = parseForm(setPasswordSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  try {
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.password),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logActivity({
      actorId: user.id,
      actorName: user.name,
      action: "updated",
      entity: "user",
      entityId: user.id,
      summary: `${user.name} set their own password`,
    });

    invalidateUsers();

    // The cookie still carries the old must-change claim, and the proxy trusts
    // it. Without re-issuing here the user is bounced straight back to this
    // screen, forever.
    await refreshSession(user.id);
  } catch (error) {
    return fail(describeError(error));
  }

  redirect(user.role === "CLIENT" ? "/portal" : "/app");
}
