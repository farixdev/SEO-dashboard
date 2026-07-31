import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const TONES: Record<BadgeTone, string> = {
  neutral:
    "bg-[var(--surface-sunken)] text-body ring-1 ring-[var(--line-soft)] ring-inset",
  muted: "bg-transparent text-faint ring-1 ring-[var(--line-soft)] ring-inset",
  brand: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success:
    "bg-[color-mix(in_oklab,var(--color-mint-500)_16%,transparent)] text-[var(--color-mint-700)] dark:text-[var(--color-mint-500)]",
  warning:
    "bg-[color-mix(in_oklab,var(--color-amber-500)_18%,transparent)] text-[var(--color-amber-700)] dark:text-[var(--color-amber-500)]",
  danger:
    "bg-[color-mix(in_oklab,var(--color-rose-500)_15%,transparent)] text-[var(--color-rose-700)] dark:text-[var(--color-rose-500)]",
  info: "bg-[color-mix(in_oklab,var(--color-sky-500)_15%,transparent)] text-[var(--color-sky-700)] dark:text-[var(--color-sky-500)]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-0.5",
        "text-[11.5px] leading-5 font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ── Domain-specific badge helpers ─────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === "Published" || status === "ACTIVE" || status === "DONE"
      ? "success"
      : status === "Pending" || status === "PAUSED" || status === "REVIEW"
        ? "warning"
        : status === "Rejected" || status === "Removed"
          ? "danger"
          : status === "IN_PROGRESS"
            ? "info"
            : "neutral";
  const label = status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function YesNoBadge({
  value,
  yes = "Yes",
  no = "No",
}: {
  value: boolean;
  yes?: string;
  no?: string;
}) {
  return <Badge tone={value ? "success" : "muted"}>{value ? yes : no}</Badge>;
}

export function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-faint">—</span>;
  const tone: BadgeTone =
    intent === "Transactional"
      ? "success"
      : intent === "Informational"
        ? "info"
        : intent === "Commercial"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{intent}</Badge>;
}

/** Google SERP page → colour, page 1 being the prize. */
export function SerpPageBadge({ page }: { page: number | null }) {
  if (page === null || page === undefined)
    return <span className="text-faint">—</span>;
  const tone: BadgeTone =
    page <= 1 ? "success" : page <= 2 ? "info" : page <= 5 ? "warning" : "danger";
  return <Badge tone={tone}>P{page}</Badge>;
}

export function SpamBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined)
    return <span className="text-faint">—</span>;
  const tone: BadgeTone = score <= 2 ? "success" : score <= 5 ? "warning" : "danger";
  return <Badge tone={tone}>{score}%</Badge>;
}
