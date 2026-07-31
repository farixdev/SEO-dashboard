import type { ReactNode } from "react";

import { AVATAR_COLORS, type AvatarColor } from "@/lib/constants";
import { cn, clamp, initials } from "@/lib/utils";

/* ── Avatar ────────────────────────────────────────────────────── */

const AVATAR_BG: Record<AvatarColor, string> = {
  indigo: "bg-[var(--color-brand-500)]",
  violet: "bg-[oklch(0.598_0.182_312)]",
  sky: "bg-[var(--color-sky-500)]",
  teal: "bg-[oklch(0.672_0.108_195)]",
  emerald: "bg-[var(--color-mint-500)]",
  amber: "bg-[var(--color-amber-500)]",
  rose: "bg-[var(--color-rose-500)]",
  slate: "bg-[oklch(0.552_0.022_265)]",
};

/** Deterministic colour when a user has none stored. */
export function colorForName(name: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
  title,
}: {
  name: string;
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  title?: string;
}) {
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-7 text-[11px]",
    md: "size-9 text-[12.5px]",
    lg: "size-12 text-base",
  } as const;
  const tone = (
    color && AVATAR_COLORS.includes(color as AvatarColor)
      ? color
      : colorForName(name)
  ) as AvatarColor;
  return (
    <span
      title={title ?? name}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white",
        "ring-2 ring-[var(--surface-raised)] select-none",
        sizes[size],
        AVATAR_BG[tone],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
}: {
  people: { name: string; avatarColor?: string | null }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} color={p.avatarColor} size="sm" />
      ))}
      {rest > 0 ? (
        <span className="text-muted surface-sunken grid size-7 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-[var(--surface-raised)]">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/* ── Progress ──────────────────────────────────────────────────── */

export function ProgressBar({
  value,
  tone = "brand",
  className,
  showLabel = false,
  height = "md",
}: {
  /** 0-100 */
  value: number;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
  showLabel?: boolean;
  height?: "sm" | "md";
}) {
  const pct = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const fills = {
    brand: "bg-[var(--accent)]",
    success: "bg-[var(--color-mint-500)]",
    warning: "bg-[var(--color-amber-500)]",
    danger: "bg-[var(--color-rose-500)]",
  } as const;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "well flex-1 overflow-hidden rounded-full",
          height === "sm" ? "h-1.5" : "h-2.5",
        )}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", fills[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel ? (
        <span className="text-muted tnum w-9 text-right text-[11.5px] font-medium">
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  );
}

/** Target-vs-actual ring used on the dashboards. */
export function ProgressRing({
  value,
  size = 84,
  stroke = 9,
  label,
  sublabel,
  tone = "brand",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const pct = clamp(Number.isFinite(value) ? value : 0, 0, 100);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const colors = {
    brand: "var(--accent)",
    success: "var(--color-mint-500)",
    warning: "var(--color-amber-500)",
    danger: "var(--color-rose-500)",
  } as const;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        <div>
          <div className="text-strong tnum text-[15px] font-semibold">
            {label ?? `${Math.round(pct)}%`}
          </div>
          {sublabel ? (
            <div className="text-faint text-[10.5px]">{sublabel}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Empty / loading states ────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="well text-faint mb-4 grid size-14 place-items-center rounded-2xl">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description ? (
        <p className="text-muted mt-1.5 max-w-sm text-[13px] leading-5">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-8 flex-1"
              // vary widths so it reads as a table, not a grid of bars
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Layout helpers ────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
        <h1 className="truncate text-[22px] leading-8 font-semibold sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted mt-1 text-[13.5px] leading-5">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-muted text-[11.5px] font-semibold tracking-[0.08em] uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-px w-full", className)}
      style={{ background: "var(--line-soft)" }}
    />
  );
}

/** Small key/value row used in detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <dt className="text-muted shrink-0 text-[12.5px]">{label}</dt>
      <dd className="text-body min-w-0 text-right text-[13px] font-medium">
        {children}
      </dd>
    </div>
  );
}
