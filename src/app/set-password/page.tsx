import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetPasswordForm } from "@/features/invites/set-password-form";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a password" };

/**
 * Blocking screen for anyone still using a password somebody else chose for
 * them. The app and portal layouts redirect here while
 * `mustChangePassword` is set, so it cannot be skipped by typing a URL.
 */
export default async function SetPasswordPage() {
  const user = await requireUser();

  // Nothing to do — do not strand them on a dead-end screen.
  if (!user.mustChangePassword) {
    redirect(user.role === "CLIENT" ? "/portal" : "/app");
  }

  return (
    <main className="surface-app grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="well mx-auto mb-6 grid size-12 place-items-center rounded-2xl text-[var(--accent)]">
          <KeyRound className="size-5" />
        </div>

        <h1 className="text-center text-[22px] leading-7 font-semibold tracking-tight">
          Choose your password
        </h1>
        <p className="text-muted mt-2 text-center text-[13.5px] leading-5">
          You are signed in with a temporary password that someone else set.
          Pick your own to continue.
        </p>

        <div className="well mt-5 px-3.5 py-2.5 text-center">
          <p className="text-faint text-[11px] font-semibold tracking-wider uppercase">
            Signed in as
          </p>
          <p className="text-strong mt-0.5 text-[13.5px] font-medium">{user.email}</p>
        </div>

        <SetPasswordForm submitLabel="Save and continue" />
      </div>
    </main>
  );
}
