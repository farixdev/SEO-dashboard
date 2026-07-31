import { eq } from "drizzle-orm";
import { BarChart3, Link2, MessagesSquare, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { projectMembers, projects, users } from "@/db/schema";
import { SetPasswordForm } from "@/features/invites/set-password-form";
import { checkInvite, hashInviteToken, inviteTokenMatches } from "@/lib/invite";

export const metadata: Metadata = { title: "Set up your access" };

const HIGHLIGHTS = [
  { icon: TrendingUp, text: "Where every keyword ranks, month by month" },
  { icon: Link2, text: "Every backlink earned for your site" },
  { icon: BarChart3, text: "Clicks and impressions from Google" },
  { icon: MessagesSquare, text: "A direct line to your SEO team" },
];

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      inviteTokenHash: users.inviteTokenHash,
      inviteExpiresAt: users.inviteExpiresAt,
      inviteAcceptedAt: users.inviteAcceptedAt,
    })
    .from(users)
    .where(eq(users.inviteTokenHash, hashInviteToken(token)))
    .limit(1);

  const usable =
    row &&
    row.inviteTokenHash &&
    inviteTokenMatches(token, row.inviteTokenHash) &&
    checkInvite(row).valid;

  if (!usable) {
    const reason = row ? checkInvite(row) : null;
    const message =
      reason && !reason.valid && reason.reason === "used"
        ? "This invite has already been used. Sign in with the password you chose."
        : reason && !reason.valid && reason.reason === "expired"
          ? "This invite link has expired. Ask your account manager to send a new one."
          : "This invite link is not valid. Ask your account manager to send a new one.";

    return (
      <main className="surface-app grid min-h-dvh place-items-center p-6">
        <div className="panel w-full max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Link no longer works</h1>
          <p className="text-muted mt-2 text-[13.5px] leading-5">{message}</p>
          <Link href="/login" className="mt-6 inline-block">
            <Button variant="primary">Go to sign in</Button>
          </Link>
        </div>
      </main>
    );
  }

  // What are they being given access to?
  const [membership] = await db
    .select({ projectName: projects.name, company: projects.clientCompany })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, row.id))
    .limit(1);

  const isClient = row.role === "CLIENT";
  const scope = membership?.company ?? membership?.projectName ?? null;

  return (
    <main className="surface-app min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(115% 90% at 10% 8%, var(--accent-soft) 0%, transparent 55%), radial-gradient(90% 80% at 90% 96%, color-mix(in oklab, var(--color-mint-500) 16%, transparent) 0%, transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-[15px] font-bold text-[var(--on-accent)]">
            S
          </span>
          <span className="text-strong text-[15px] font-semibold">SEO Dashboard</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[30px] leading-[1.15] font-semibold tracking-tight">
            {isClient ? "Your SEO progress, in one place." : "Welcome to the team."}
          </h2>
          <p className="text-muted mt-4 text-[15px] leading-6">
            {isClient
              ? "No spreadsheets, no attachments. Sign in any time to see exactly where your search visibility stands."
              : "Set a password and you will land straight in the agency console."}
          </p>
          {isClient ? (
            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-body text-[13.5px]">{text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="text-faint relative text-[12px]">
          This link works once and only for you.
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <p className="text-[var(--accent)] text-[11.5px] font-semibold tracking-[0.14em] uppercase">
            Invitation
          </p>
          <h1 className="mt-2 text-[24px] leading-8 font-semibold tracking-tight">
            Hello {row.name.split(" ")[0]}
          </h1>
          <p className="text-muted mt-2 text-[13.5px] leading-5">
            {scope
              ? `You have been given access to the ${scope} dashboard. `
              : "You have been given access to the dashboard. "}
            Choose a password to finish setting up.
          </p>

          <div className="well mt-5 px-3.5 py-2.5">
            <p className="text-faint text-[11px] font-semibold tracking-wider uppercase">
              Your sign-in email
            </p>
            <p className="text-strong mt-0.5 text-[13.5px] font-medium">{row.email}</p>
          </div>

          <SetPasswordForm token={token} submitLabel="Set password and continue" />

          <p className="text-faint mt-8 text-center text-[12px] leading-5">
            Already set this up?{" "}
            <Link href="/login" className="text-[var(--accent)] hover:underline">
              Sign in instead
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
