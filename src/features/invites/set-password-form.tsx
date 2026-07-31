"use client";

import { AlertCircle, ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { idle } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import { acceptInviteAction, setOwnPasswordAction } from "./actions";

/** Live requirement checklist — mirrors `passwordSchema`. */
function Requirements({ value }: { value: string }) {
  const rules = [
    { met: value.length >= 8, label: "At least 8 characters" },
    { met: /[a-zA-Z]/.test(value), label: "Contains a letter" },
    { met: /[0-9]/.test(value), label: "Contains a number" },
  ];
  return (
    <ul className="mt-2 space-y-1">
      {rules.map((r) => (
        <li
          key={r.label}
          className={cn(
            "flex items-center gap-1.5 text-[12px] transition-colors",
            r.met ? "text-[var(--color-mint-600)]" : "text-faint",
          )}
        >
          <Check
            className={cn("size-3.5 shrink-0", !r.met && "opacity-30")}
            aria-hidden
          />
          {r.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shared by the invite page (with a token) and the forced first-password
 * screen (without one).
 */
export function SetPasswordForm({
  token,
  submitLabel,
}: {
  token?: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(
    token ? acceptInviteAction : setOwnPasswordAction,
    idle,
  );
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);

  return (
    <form action={action} className="mt-7 space-y-4">
      {token ? <input type="hidden" name="token" value={token} /> : null}

      {state.message && !state.ok ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-[color-mix(in_oklab,var(--color-rose-500)_12%,transparent)] px-3.5 py-3"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-[var(--color-rose-600)] dark:text-[var(--color-rose-500)]" />
          <p className="text-[13px] leading-5 text-[var(--color-rose-700)] dark:text-[var(--color-rose-500)]">
            {state.message}
          </p>
        </div>
      ) : null}

      <div>
        <div className="relative">
          <Input
            label="Choose a password"
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={state.errors?.password}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            className="text-faint hover:text-strong absolute top-[30px] right-3 rounded p-0.5 transition-colors"
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Requirements value={password} />
      </div>

      <Input
        label="Confirm password"
        name="confirmPassword"
        type={shown ? "text" : "password"}
        autoComplete="new-password"
        required
        error={state.errors?.confirmPassword}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        className="mt-2 w-full"
      >
        {pending ? "Setting up…" : submitLabel}
        {!pending ? <ArrowRight className="size-4" /> : null}
      </Button>
    </form>
  );
}
