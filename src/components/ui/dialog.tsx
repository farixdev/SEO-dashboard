"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { Button } from "./button";

export function useDialog(initial = false) {
  const [open, setOpen] = useState(initial);
  return {
    open,
    setOpen,
    show: useCallback(() => setOpen(true), []),
    hide: useCallback(() => setOpen(false), []),
    toggle: useCallback(() => setOpen((o) => !o), []),
  };
}

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1400px)]",
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  /** Set false for forms where a stray backdrop click would lose work. */
  dismissOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: keyof typeof WIDTHS;
  dismissOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal mount gate — createPortal needs a document, which only exists after mount
  useEffect(() => setMounted(true), []);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first meaningful control in the panel.
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]), textarea, select, button",
      );
      target?.focus();
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div
        className="animate-fade fixed inset-0 bg-[oklch(0.2_0.01_85_/_0.5)] backdrop-blur-sm"
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "panel-lg animate-pop relative my-auto flex w-full flex-col",
          "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]",
          WIDTHS[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] leading-6 font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="text-muted mt-1 text-[13px] leading-5">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-2"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>

        {footer ? (
          <div
            className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4"
            style={{ borderColor: "var(--line-soft)" }}
          >
            {footer}
          </div>
        ) : (
          <div className="pb-4" />
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Confirm ───────────────────────────────────────────────────── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div />
    </Dialog>
  );
}

/* ── Slide-over (used for row detail + edit) ───────────────────── */

export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal mount gate — createPortal needs a document, which only exists after mount
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="animate-fade absolute inset-0 bg-[oklch(0.2_0.01_85_/_0.45)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "surface-raised relative flex h-full w-full flex-col shadow-[var(--elev-3)]",
          "animate-fade-up sm:rounded-l-[var(--radius-panel-lg)]",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] leading-6 font-semibold">{title}</h2>
            {description ? (
              <p className="text-muted mt-1 text-[13px]">{description}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer ? (
          <div
            className="flex items-center justify-end gap-2 border-t px-6 py-4"
            style={{ borderColor: "var(--line-soft)" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
