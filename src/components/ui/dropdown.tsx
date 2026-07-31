"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
  triggerClassName,
  label = "Open menu",
  side = "bottom",
}: {
  trigger?: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  /** Override the default icon-button styling — e.g. for a full-width row. */
  triggerClassName?: string;
  label?: string;
  /**
   * Which way the menu opens. A trigger sitting at the bottom of a full-height
   * sidebar needs "top" — opening downward puts the menu below the viewport,
   * where it is invisible and the user concludes the button is broken.
   */
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "rounded-xl transition-colors hover:bg-[var(--surface-hover)]",
          triggerClassName ??
            "text-muted hover:text-strong inline-flex size-8 items-center justify-center",
          open && "bg-[var(--surface-hover)]",
        )}
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>
      {open ? (
        <div
          role="menu"
          onClick={(event) => {
            /*
             * A menu item can be the submit button of a form (deactivating an
             * account is one). Click is a discrete event, so React flushes this
             * state update synchronously and unmounts the <form> before the
             * browser gets to perform the click's default action — and a form
             * that is no longer in the document is never submitted, so the item
             * did nothing at all. Deferring the close by a task lets the
             * submission happen first.
             */
            const fromSubmit = (event.target as HTMLElement | null)?.closest?.(
              'button[type="submit"]',
            );
            if (fromSubmit) window.setTimeout(() => setOpen(false), 0);
            else setOpen(false);
          }}
          className={cn(
            "panel-lg animate-pop absolute z-40 min-w-48 overflow-hidden p-1.5",
            side === "top" ? "bottom-full mb-1.5" : "mt-1.5",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      ) : null}
    </div>
  );
}

const ITEM_BASE = cn(
  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium",
  "transition-colors disabled:pointer-events-none disabled:opacity-50",
);

const ITEM_TONES = {
  default: "text-body hover:bg-[var(--surface-hover)] hover:text-strong",
  danger:
    "text-[var(--color-rose-600)] hover:bg-[color-mix(in_oklab,var(--color-rose-500)_12%,transparent)] dark:text-[var(--color-rose-500)]",
} as const;

export function DropdownItem({
  children,
  onClick,
  icon,
  tone = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: keyof typeof ITEM_TONES;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(ITEM_BASE, ITEM_TONES[tone])}
    >
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/** Navigational menu row — an anchor, so it never nests a button in a link. */
export function DropdownLink({
  href,
  children,
  icon,
  tone = "default",
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof ITEM_TONES;
}) {
  return (
    <Link href={href} role="menuitem" className={cn(ITEM_BASE, ITEM_TONES[tone])}>
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-faint truncate px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="my-1.5 h-px" style={{ background: "var(--line-soft)" }} />;
}
