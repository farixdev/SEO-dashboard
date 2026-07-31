"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back to a temp textarea.
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "text-faint hover:text-strong inline-flex shrink-0 items-center justify-center rounded-lg",
        "transition-colors hover:bg-[var(--surface-hover)]",
        size === "sm" ? "size-6" : "size-8",
        copied && "text-[var(--color-mint-600)]",
        className,
      )}
    >
      {copied ? (
        <Check className={size === "sm" ? "size-3.5" : "size-4"} />
      ) : (
        <Copy className={size === "sm" ? "size-3.5" : "size-4"} />
      )}
    </button>
  );
}

/** Credential row: value stays masked until explicitly revealed. */
export function SecretField({
  value,
  label,
  className,
}: {
  value: string | null;
  label?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-faint">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <code
        className={cn(
          "surface-sunken max-w-[18ch] truncate rounded-md px-1.5 py-0.5 font-mono text-[12px]",
          !shown && "tracking-widest select-none",
        )}
        title={shown ? value : undefined}
      >
        {shown ? value : "••••••••"}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? `Hide ${label ?? "value"}` : `Reveal ${label ?? "value"}`}
        className="text-faint hover:text-strong rounded p-0.5 transition-colors"
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <CopyButton value={value} label={`Copy ${label ?? "value"}`} />
    </span>
  );
}
