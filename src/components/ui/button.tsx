import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--elev-1)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--elev-2)]",
  secondary:
    "surface-raised text-strong shadow-[var(--elev-1),var(--rim)] hover:shadow-[var(--elev-2)]",
  outline:
    "border border-[var(--line-strong)] bg-transparent text-body hover:bg-[var(--surface-hover)]",
  ghost: "bg-transparent text-muted hover:bg-[var(--surface-hover)] hover:text-strong",
  danger:
    "bg-[var(--color-rose-600)] text-white shadow-[var(--elev-1)] hover:bg-[var(--color-rose-700)]",
  success:
    "bg-[var(--color-mint-600)] text-white shadow-[var(--elev-1)] hover:bg-[var(--color-mint-700)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-xl px-3 text-[13px]",
  md: "h-10 gap-2 rounded-2xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-6 text-[15px]",
  icon: "h-9 w-9 shrink-0 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center font-medium",
        "transition-all duration-150 ease-out active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
