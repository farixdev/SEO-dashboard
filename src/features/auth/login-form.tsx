"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { idle } from "@/lib/action-state";

import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, idle);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="mt-7 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="you@company.com"
        required
        error={state.errors?.email}
        autoFocus
      />

      <div>
        <div className="relative">
          <Input
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            error={state.errors?.password}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="text-faint hover:text-strong absolute top-[30px] right-3 rounded p-0.5 transition-colors"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        className="mt-2 w-full"
      >
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <ArrowRight className="size-4" /> : null}
      </Button>
    </form>
  );
}
