"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastContextValue = {
  push: (toast: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal mount gate — createPortal needs a document, which only exists after mount
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = ++counter;
      setToasts((list) => [...list.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 7000 : 4200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
      warning: (title, description) => push({ tone: "warning", title, description }),
      info: (title, description) => push({ tone: "info", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:right-0 sm:left-auto sm:items-end"
              role="region"
              aria-live="polite"
            >
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: "text-[var(--color-mint-600)]",
  error: "text-[var(--color-rose-600)]",
  warning: "text-[var(--color-amber-600)]",
  info: "text-[var(--color-sky-600)]",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.tone];
  return (
    <div
      className={cn(
        "panel animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-[18px] shrink-0", TONE_STYLES[toast.tone])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-strong text-[13.5px] leading-5 font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="text-muted mt-0.5 text-[12.5px] leading-4">{toast.description}</p>
        ) : null}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-faint hover:text-strong -mt-1 -mr-1 rounded-lg p-1 transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
