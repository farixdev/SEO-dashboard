import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/* ════════════════════════════════════════════════════════════════
   One-time invite links.

   The admin never handles the client's password. They generate a link,
   send it however they like, and the client sets their own password on
   the way in.

   Only the SHA-256 of the token is stored. The raw token lives in the
   URL and nowhere else, so a database leak cannot be replayed. The
   trade-off is that a link cannot be shown twice — regenerating is one
   click, which is the right default anyway: it invalidates the old one.
   ════════════════════════════════════════════════════════════════ */

/** How long an unused invite stays valid. */
export const INVITE_TTL_DAYS = 7;

/** 32 random bytes, URL-safe. Long enough that guessing is not a concern. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison, so response timing cannot be used to narrow
 * down a valid token one character at a time.
 */
export function inviteTokenMatches(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashInviteToken(token), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function inviteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Absolute URL for an invite. Prefers the configured public URL so links
 * pasted into an email are not localhost; falls back to the request origin.
 */
export function inviteUrl(token: string, origin?: string): string {
  /*
   * On Vercel, NEXT_PUBLIC_APP_URL is easy to forget — and an invite link
   * pointing at localhost is worse than useless, because it looks like it
   * worked. Vercel always injects the deployment host, so fall back to that
   * before giving up.
   */
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (vercelHost ? `https://${vercelHost}` : "") ||
    origin ||
    ""
  ).replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

export type InviteState =
  | { valid: true }
  | { valid: false; reason: "unknown" | "expired" | "used" | "inactive" };

export function checkInvite(row: {
  inviteExpiresAt: Date | null;
  inviteAcceptedAt: Date | null;
  isActive: boolean;
}): InviteState {
  if (!row.isActive) return { valid: false, reason: "inactive" };
  if (row.inviteAcceptedAt) return { valid: false, reason: "used" };
  if (!row.inviteExpiresAt || row.inviteExpiresAt.getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true };
}
