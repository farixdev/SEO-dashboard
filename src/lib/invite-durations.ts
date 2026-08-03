/*
 * The duration options, kept out of `lib/invite.ts` on purpose.
 *
 * That module imports `server-only` because it holds the token generation and
 * hashing, which must never reach the browser. The picker in the invite dialog
 * is a client component and only needs the list of choices, so the choices
 * live here and `lib/invite.ts` re-exports them for server callers.
 */

/** Default when nothing is chosen. */
export const INVITE_TTL_DAYS = 7;

/**
 * How long an invite may stay valid. `null` days means it never lapses.
 *
 * "Never" is offered because a client can take weeks to get round to signing
 * in and a dead link is a support conversation — but it is a real trade: an
 * unexpiring link is a permanent credential for anyone who ever sees it, so it
 * is last in the list and the dialog says so.
 */
export const INVITE_DURATIONS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: null, label: "Never expires" },
] as const;

export type InviteDurationDays = (typeof INVITE_DURATIONS)[number]["days"];

const ALLOWED_DAYS = new Set<number | null>(INVITE_DURATIONS.map((d) => d.days));

/** Parses a submitted duration, falling back to the default rather than trusting it. */
export function parseInviteDuration(value: unknown): InviteDurationDays {
  if (value === "never" || value === null) return null;
  const n = Number(value);
  return ALLOWED_DAYS.has(n) ? (n as InviteDurationDays) : INVITE_TTL_DAYS;
}

export function inviteExpiry(
  days: InviteDurationDays = INVITE_TTL_DAYS,
  from = new Date(),
): Date | null {
  if (days === null) return null;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
