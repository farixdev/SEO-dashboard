import "server-only";

import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { projectMembers, projects, users } from "@/db/schema";

import { STAFF_ROLES, type UserRole } from "./constants";
import {
  SESSION_COOKIE,
  cookieOptions,
  signSession,
  verifySession,
} from "./session";

const BCRYPT_ROUNDS = 11;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** A short, human-friendly password for client accounts the admin creates. */
export function generatePassword(length = 14) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const symbols = "!@#$%&*?";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length - 2; i++) out += alphabet[bytes[i] % alphabet.length];
  out += symbols[bytes[length - 2] % symbols.length];
  out += alphabet[bytes[length - 1] % alphabet.length].toUpperCase();
  return out;
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  title: string | null;
  avatarColor: string;
  mustChangePassword: boolean;
  /** Projects this user can reach. Admins/managers see all. */
  projectIds: string[];
};

/**
 * Reads the session cookie and re-validates the user against the DB, so a
 * deactivated account or a changed role takes effect on the next request
 * rather than when the JWT happens to expire.
 *
 * `cache()` dedupes this across a single render pass.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  /*
   * One round trip, not two. This runs on every single request, and the
   * account row and the project list used to be fetched sequentially — over
   * an HTTP driver to a region several hundred milliseconds away, that second
   * trip was ~237ms added to every page in the app, measured. Folding the
   * project list into a subquery gets the same data in one.
   *
   * Deliberately still uncached: a deactivated account or a changed role has
   * to take effect on the very next request, not when a tag happens to expire.
   */
  const result = await db.execute(sql`
    select
      u.id,
      u.email,
      u.name,
      u.role,
      u.title,
      u.avatar_color              as "avatarColor",
      u.is_active                 as "isActive",
      u.must_change_password      as "mustChangePassword",
      case
        when u.role in ('ADMIN', 'MANAGER')
          then (select coalesce(array_agg(p.id), '{}') from ${projects} p)
        else (
          select coalesce(array_agg(pm.project_id), '{}')
          from ${projectMembers} pm
          where pm.user_id = u.id
        )
      end                         as "projectIds"
    from ${users} u
    where u.id = ${session.sub}
    limit 1
  `);

  type Row = {
    id: string;
    email: string;
    name: string;
    role: string;
    title: string | null;
    avatarColor: string;
    isActive: boolean;
    mustChangePassword: boolean;
    projectIds: string[] | null;
  };

  // neon-http returns { rows }, other drivers return the array directly.
  const rows =
    (result as unknown as { rows?: Row[] }).rows ?? (result as unknown as Row[]);
  const row = rows?.[0];

  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    title: row.title,
    avatarColor: row.avatarColor,
    mustChangePassword: row.mustChangePassword,
    projectIds: row.projectIds ?? [],
  };
});

/* ── Guards ────────────────────────────────────────────────────── */

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Someone still on a password another person chose has no business seeing
 * project data. Enforced in the guards rather than in a layout: Next renders
 * layouts and pages in parallel, so a layout-only redirect still lets the page
 * run its queries and ship them in the streamed payload.
 *
 * `/set-password` itself uses bare `requireUser()`, so it cannot loop.
 */
function requirePasswordSet(user: CurrentUser) {
  if (user.mustChangePassword) redirect("/set-password");
}

/** Any team member (admin, manager, specialist). Clients are bounced. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!STAFF_ROLES.includes(user.role)) redirect("/portal");
  requirePasswordSet(user);
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/app");
  return user;
}

export async function requireClient(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "CLIENT") redirect("/app");
  requirePasswordSet(user);
  return user;
}

/**
 * Throws unless the user may read this project. Returns the project so callers
 * do not need a second query.
 */
export async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  requirePasswordSet(user);
  if (!user.projectIds.includes(projectId)) {
    redirect(user.role === "CLIENT" ? "/portal" : "/app");
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) redirect(user.role === "CLIENT" ? "/portal" : "/app");
  return { user, project };
}

/** The one project a client account is attached to. */
export async function getClientProjectId(userId: string) {
  const [row] = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.role, "CLIENT_VIEWER"),
      ),
    )
    .limit(1);
  return row?.projectId ?? null;
}

/* ── Sign in / out ─────────────────────────────────────────────── */

export type LoginResult =
  | { ok: true; userId: string; name: string; role: UserRole; redirectTo: string }
  | { ok: false; error: string };

export async function login(
  emailInput: string,
  password: string,
): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "Enter your email and password." };
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  // Same message either way — do not leak which emails exist.
  const invalid = { ok: false as const, error: "Invalid email or password." };
  if (!row) {
    // Constant-ish work so timing does not reveal account existence.
    await bcrypt.compare(password, "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu");
    return invalid;
  }
  if (!row.isActive) {
    return { ok: false, error: "This account has been deactivated." };
  }
  if (!(await verifyPassword(password, row.passwordHash))) return invalid;

  const role = row.role as UserRole;
  const projectId = role === "CLIENT" ? await getClientProjectId(row.id) : null;

  const token = await signSession({
    sub: row.id,
    email: row.email,
    name: row.name,
    role,
    projectId,
    mustChangePassword: row.mustChangePassword,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions());

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, row.id));

  return {
    ok: true,
    userId: row.id,
    name: row.name,
    role,
    redirectTo: role === "CLIENT" ? "/portal" : "/app",
  };
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Re-issues the cookie after a role/project change so nav stays correct. */
export async function refreshSession(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return;
  const role = row.role as UserRole;
  const projectId = role === "CLIENT" ? await getClientProjectId(row.id) : null;
  const token = await signSession({
    sub: row.id,
    email: row.email,
    name: row.name,
    role,
    projectId,
    mustChangePassword: row.mustChangePassword,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions());
}
