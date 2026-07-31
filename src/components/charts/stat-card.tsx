import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatTone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

const ICON_TONES: Record<StatTone, string> = {
  brand: "bg-[var(--accent-soft)] text-[var(--accent)]",
  success:
    "bg-[color-mix(in_oklab,var(--color-mint-500)_16%,transparent)] text-[var(--color-mint-600)]",
  warning:
    "bg-[color-mix(in_oklab,var(--color-amber-500)_18%,transparent)] text-[var(--color-amber-600)]",
  danger:
    "bg-[color-mix(in_oklab,var(--color-rose-500)_15%,transparent)] text-[var(--color-rose-600)]",
  info: "bg-[color-mix(in_oklab,var(--color-sky-500)_15%,transparent)] text-[var(--color-sky-600)]",
  neutral: "surface-sunken text-muted",
};

/**
 * KPI tile. `delta` is already sign-corrected by the caller — for rank metrics
 * a *falling* position is an improvement, so the caller passes the inverted
 * value and we just colour what we are given.
 */
export function StatCard({
  label,
  value,
  sublabel,
  delta,
  deltaLabel,
  icon,
  tone = "brand",
  chart,
  className,
  invertDeltaColor = false,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  icon?: ReactNode;
  tone?: StatTone;
  chart?: ReactNode;
  className?: string;
  invertDeltaColor?: boolean;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const flat = hasDelta && Math.abs(delta) < 0.05;
  const positive = hasDelta && !flat && (invertDeltaColor ? delta < 0 : delta > 0);
  const negative = hasDelta && !flat && !positive;
  const DeltaIcon = flat ? ArrowRight : delta! > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn("panel panel-interactive flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted truncate text-[12.5px] font-medium">{label}</p>
          <p className="text-strong tnum mt-1.5 text-[26px] leading-8 font-semibold tracking-tight">
            {value}
          </p>
        </div>
        {icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-2xl",
              ICON_TONES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      {chart ? <div className="-mx-1 mt-3">{chart}</div> : null}

      {hasDelta || sublabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[12px] font-semibold",
                flat && "surface-sunken text-muted",
                positive &&
                  "bg-[color-mix(in_oklab,var(--color-mint-500)_16%,transparent)] text-[var(--color-mint-700)] dark:text-[var(--color-mint-500)]",
                negative &&
                  "bg-[color-mix(in_oklab,var(--color-rose-500)_14%,transparent)] text-[var(--color-rose-700)] dark:text-[var(--color-rose-500)]",
              )}
            >
              <DeltaIcon className="size-3" aria-hidden />
              {flat
                ? "No change"
                : `${Math.abs(delta!) < 100 ? Math.abs(delta!).toFixed(1) : Math.round(Math.abs(delta!)).toLocaleString()}${deltaLabel ?? "%"}`}
            </span>
          ) : null}
          {sublabel ? (
            <span className="text-faint text-[12px]">{sublabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Compact variant for dense grids (team performance, monthly summary). */
export function MiniStat({
  label,
  value,
  sublabel,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("well px-3.5 py-3", className)}>
      <p className="text-faint truncate text-[11.5px] font-medium">{label}</p>
      <p
        className={cn(
          "tnum mt-0.5 text-[19px] leading-6 font-semibold",
          tone === "success" && "text-[var(--color-mint-600)]",
          tone === "warning" && "text-[var(--color-amber-600)]",
          tone === "danger" && "text-[var(--color-rose-600)]",
          tone === "info" && "text-[var(--color-sky-600)]",
          tone === "brand" && "text-[var(--accent)]",
          tone === "neutral" && "text-strong",
        )}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="text-faint mt-0.5 text-[11.5px]">{sublabel}</p>
      ) : null}
    </div>
  );
}
