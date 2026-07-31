import { SignJWT, jwtVerify } from "jose";

import { SESSION_COOKIE, type UserRole } from "./constants";

export { SESSION_COOKIE };

export type SessionPayload = {
  sub: string; // user id
  email: string;
  name: string;
  role: UserRole;
  /** For clients: the single project they belong to. Saves a DB hop in nav. */
  projectId?: string | null;
  /**
   * Mirrors `users.must_change_password` at sign-in time so the proxy can
   * block at the edge, before any rendering starts. The DB stays the source
   * of truth — the guards re-check it on every request.
   */
  mustChangePassword?: boolean;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a 32+ character random string in .env.local.",
    );
  }
  return new TextEncoder().encode(secret);
}

export function sessionMaxAgeSeconds() {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS ?? 14);
  return (Number.isFinite(days) && days > 0 ? days : 14) * 24 * 60 * 60;
}

export async function signSession(payload: SessionPayload) {
  const maxAge = sessionMaxAgeSeconds();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAge)
    .setSubject(payload.sub)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || !payload.role) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as UserRole,
      projectId: (payload.projectId as string | null | undefined) ?? null,
      mustChangePassword: payload.mustChangePassword === true,
    } satisfies SessionPayload;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  };
}
