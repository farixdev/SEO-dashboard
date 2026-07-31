"use client";

import { Check, Link2, RotateCw, Send, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { formatDate } from "@/lib/utils";

import { createInviteAction, revokeInviteAction } from "./actions";

type Created = { url: string; email: string; expiresAt: string };

/**
 * Generates a one-time invite link and shows it once. The admin copies it and
 * sends it however they like — the password is never handled by anyone but
 * the person being invited.
 */
type InviteProps = {
  userId: string;
  userName: string;
  userEmail: string;
  hasPendingInvite: boolean;
  inviteExpiresAt: string | null;
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
};

export function InviteButton(props: InviteProps) {
  const { hasPendingInvite, variant = "secondary", label = "Invite" } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Send className="size-3.5" />
        {label}
        {hasPendingInvite ? (
          <Badge tone="warning" className="ml-1">
            pending
          </Badge>
        ) : null}
      </Button>

      {/*
        Mounted only while open. Keeping it mounted meant the action result
        outlived the close, so pressing "Re-invite" reopened straight onto the
        previously generated link and never asked the server for a new one.
      */}
      {open ? <InviteDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function InviteDialog({
  userId,
  userName,
  userEmail,
  hasPendingInvite,
  inviteExpiresAt,
  onClose,
}: InviteProps & { onClose: () => void }) {
  const [state, action, pending] = useActionState(createInviteAction, idle);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const created = state.ok ? (state.data as Created | undefined) : undefined;

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message);
  }, [state, toast]);

  const subject = encodeURIComponent("Your SEO dashboard access");
  const body = created
    ? encodeURIComponent(
        `Hi ${userName.split(" ")[0]},\n\n` +
          `Here is your access to the SEO dashboard. The link below lets you ` +
          `choose your own password:\n\n${created.url}\n\n` +
          `It works once and expires on ${formatDate(created.expiresAt)}.\n\n` +
          `After that you can sign in any time with ${created.email}.\n`,
      )
    : "";

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        width="md"
        title={created ? "Invite link ready" : `Invite ${userName}`}
        description={
          created
            ? "Copy it now — for security the link is stored hashed and cannot be shown again. You can always generate a new one."
            : "Generates a one-time link. They choose their own password, so no password is ever sent by email."
        }
        footer={
          created ? (
            <Button variant="primary" onClick={() => onClose()}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onClose()} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="invite-form"
                variant="primary"
                loading={pending}
              >
                <Link2 className="size-4" />
                {hasPendingInvite ? "Generate a new link" : "Create invite link"}
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="space-y-4 pb-2">
            <div className="well p-4">
              <p className="text-faint mb-1.5 text-[11px] font-semibold tracking-wider uppercase">
                Send them this link
              </p>
              <div className="flex items-start gap-1.5">
                <code className="surface-raised min-w-0 flex-1 rounded-lg px-2.5 py-2 font-mono text-[12px] break-all">
                  {created.url}
                </code>
                <CopyButton size="md" value={created.url} label="Copy invite link" />
              </div>
              <p className="text-faint mt-2 text-[11.5px]">
                Works once · expires {formatDate(created.expiresAt)}
              </p>
            </div>

            <div className="well p-4">
              <p className="text-faint mb-1.5 text-[11px] font-semibold tracking-wider uppercase">
                Their sign-in email
              </p>
              <div className="flex items-center gap-1.5">
                <code className="surface-raised flex-1 truncate rounded-lg px-2.5 py-2 text-[12.5px]">
                  {created.email}
                </code>
                <CopyButton size="md" value={created.email} label="Copy email" />
              </div>
            </div>

            <a href={`mailto:${created.email}?subject=${subject}&body=${body}`}>
              <Button variant="secondary" className="w-full">
                <Send className="size-4" />
                Open in your email app
              </Button>
            </a>
          </div>
        ) : (
          <form id="invite-form" action={action} className="space-y-4 pb-2">
            <input type="hidden" name="userId" value={userId} />

            <div className="well p-4">
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Name</dt>
                  <dd className="text-strong font-medium">{userName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Email</dt>
                  <dd className="text-strong truncate font-medium">{userEmail}</dd>
                </div>
              </dl>
            </div>

            {hasPendingInvite ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-[color-mix(in_oklab,var(--color-amber-500)_14%,transparent)] px-3.5 py-3">
                <RotateCw className="mt-px size-4 shrink-0 text-[var(--color-amber-600)]" />
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-5 text-[var(--color-amber-700)] dark:text-[var(--color-amber-500)]">
                    An invite is already outstanding
                    {inviteExpiresAt ? `, valid until ${formatDate(inviteExpiresAt)}` : ""}
                    . Generating a new link cancels the old one.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("userId", userId);
                      startTransition(async () => {
                        await revokeInviteAction(fd);
                        toast.success("Invite revoked.");
                        onClose();
                      });
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-amber-700)] underline underline-offset-2 dark:text-[var(--color-amber-500)]"
                  >
                    <X className="size-3" />
                    Revoke it instead
                  </button>
                </div>
              </div>
            ) : null}

            <ul className="space-y-1.5">
              {[
                "They pick their own password — you never see it",
                "The link stops working once used",
                "It expires after 7 days",
              ].map((point) => (
                <li key={point} className="text-muted flex items-center gap-2 text-[12.5px]">
                  <Check className="size-3.5 shrink-0 text-[var(--color-mint-600)]" />
                  {point}
                </li>
              ))}
            </ul>
          </form>
        )}
      </Dialog>
    </>
  );
}
