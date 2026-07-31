import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   Client-portal presentation layer.

   The agency console optimises for density — a specialist scanning 1,700
   rows. The portal optimises for confidence: fewer numbers, each one
   given room, plain language, and a clear sense of direction.

   These components are only used under /portal.
   ════════════════════════════════════════════════════════════════ */

/** Full-bleed masthead that opens the portal. */
export function Masthead({
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className="panel relative mb-6 overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, color-mix(in oklab, var(--accent) 5%, var(--surface-raised)) 0%, var(--surface-raised) 55%)",
      }}
    >
      {/* A single accent edge along the top, instead of a floating glow. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 size-80 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent) 22%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative px-6 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="eyebrow mb-2.5 text-[var(--accent)]">{eyebrow}</p>
            ) : null}
            <h1 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.028em] sm:text-[38px]">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-muted mt-3 max-w-2xl text-[14.5px] leading-[1.6]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
        </div>
        {children ? <div className="mt-7">{children}</div> : null}
      </div>
    </section>
  );
}

/* ── Headline figure ───────────────────────────────────────────── */

export type HeroTone = "brand" | "success" | "info" | "warning";

/**
 * "3 keywords", not "3.0 keywords". A decimal on a whole count contradicts
 * itself on the one screen that is entirely about counting things — but a
 * genuine fraction (an average position moving 1.4 places) keeps its precision.
 */
function formatDelta(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  if (value >= 100) return Math.round(value).toLocaleString();
  return value.toFixed(1);
}

const HERO_ACCENT: Record<HeroTone, string> = {
  brand: "var(--accent)",
  success: "var(--color-mint-500)",
  info: "var(--color-sky-500)",
  warning: "var(--color-amber-500)",
};

/**
 * One number, large, with its meaning spelled out underneath. Deliberately
 * sparse — a client should be able to read the whole row in five seconds.
 */
export function HeroStat({
  label,
  value,
  unit,
  caption,
  delta,
  deltaSuffix = "%",
  /** true when a falling number is the good outcome, e.g. search position */
  lowerIsBetter = false,
  tone = "brand",
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  lowerIsBetter?: boolean;
  tone?: HeroTone;
  icon?: ReactNode;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const flat = hasDelta && Math.abs(delta) < 0.05;
  const improved = hasDelta && !flat && (lowerIsBetter ? delta < 0 : delta > 0);

  return (
    <div className="relative">
      {/* Accent rule, echoing the tone without shouting. */}
      <span
        aria-hidden
        className="absolute top-1 left-0 h-8 w-[3px] rounded-full"
        style={{ background: HERO_ACCENT[tone] }}
      />
      <div className="pl-4">
        <div className="flex items-center gap-1.5">
          {icon ? (
            <span className="text-faint" style={{ color: HERO_ACCENT[tone] }}>
              {icon}
            </span>
          ) : null}
          <p className="eyebrow text-[var(--text-muted)]">{label}</p>
        </div>

        <p className="figure-xl mt-2 flex items-baseline gap-1.5">
          {value}
          {unit ? (
            <span className="text-faint text-[14px] font-medium tracking-normal">
              {unit}
            </span>
          ) : null}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {hasDelta ? (
            <span
              className={cn(
                "tnum text-[12.5px] font-semibold",
                flat && "text-muted",
                !flat && improved && "text-[var(--color-mint-600)]",
                !flat && !improved && "text-[var(--color-rose-600)]",
              )}
            >
              {flat ? "level" : `${delta! > 0 ? "▲" : "▼"} ${formatDelta(Math.abs(delta!))}${deltaSuffix}`}
            </span>
          ) : null}
          {caption ? (
            <span className="text-faint text-[12px]">{caption}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The four-across hero row. */
export function HeroRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/* ── Narrative ─────────────────────────────────────────────────── */

/**
 * A plain-English read of the month. Clients ask "is this good?" — this
 * answers it in words before they reach a single chart.
 */
export function Verdict({
  tone,
  headline,
  points,
}: {
  tone: "positive" | "steady" | "attention";
  headline: string;
  points: string[];
}) {
  const palette = {
    positive: {
      bg: "color-mix(in oklab, var(--color-mint-500) 10%, transparent)",
      dot: "var(--color-mint-500)",
      text: "var(--color-mint-700)",
    },
    steady: {
      bg: "color-mix(in oklab, var(--color-sky-500) 10%, transparent)",
      dot: "var(--color-sky-500)",
      text: "var(--color-sky-700)",
    },
    attention: {
      bg: "color-mix(in oklab, var(--color-amber-500) 12%, transparent)",
      dot: "var(--color-amber-500)",
      text: "var(--color-amber-700)",
    },
  }[tone];

  return (
    <div className="panel overflow-hidden">
      <div className="px-6 py-5" style={{ background: palette.bg }}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ background: palette.dot }}
          />
          <p
            className="text-[15px] leading-6 font-semibold"
            style={{ color: palette.text }}
          >
            {headline}
          </p>
        </div>
      </div>
      <ul className="space-y-3 px-6 py-5">
        {points.map((point, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden
              className="text-faint mt-0.5 w-4 shrink-0 text-[11px] font-semibold tabular-nums"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-body text-[13.5px] leading-6">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Panels ────────────────────────────────────────────────────── */

/** Section wrapper with a title that sits outside the card. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={className}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 className="text-[15px] leading-6 font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="text-muted mt-0.5 text-[12.5px] leading-5">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn("panel", padded && "p-5 sm:p-6")}>{children}</div>
    </section>
  );
}

/* ── Milestone / progress ──────────────────────────────────────── */

/** Horizontal target meter with the number stated in words. */
export function Milestone({
  label,
  actual,
  target,
  unit,
  caption,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  caption?: string;
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const met = actual >= target && target > 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-body text-[13px] font-medium">{label}</span>
        <span className="text-strong tnum text-[13px] font-semibold">
          {actual.toLocaleString()}
          <span className="text-faint font-normal"> / {target.toLocaleString()}</span>
        </span>
      </div>
      <div className="well h-2.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${pct}%`,
            background: met
              ? "var(--color-mint-500)"
              : `linear-gradient(90deg, var(--accent) 0%, color-mix(in oklab, var(--accent) 60%, var(--color-sky-500)) 100%)`,
          }}
        />
      </div>
      <p className="text-faint mt-1.5 text-[11.5px]">
        {caption ?? `${Math.round(pct)}% of this month's ${unit} target`}
      </p>
    </div>
  );
}

/* ── Ranking distribution ──────────────────────────────────────── */

/**
 * Where the keywords sit, as proportional segments rather than a bar chart.
 * Reads as one sentence: "this much of your portfolio is on page one".
 */
export function RankSpread({
  bands,
}: {
  bands: { label: string; value: number; tone: string }[];
}) {
  const total = bands.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return (
      <p className="text-faint py-6 text-center text-[12.5px]">
        No positions recorded for this month yet.
      </p>
    );
  }

  return (
    <div>
      <div className="well flex h-4 overflow-hidden rounded-full">
        {bands
          .filter((b) => b.value > 0)
          .map((b) => (
            <div
              key={b.label}
              title={`${b.label}: ${b.value}`}
              style={{ width: `${(b.value / total) * 100}%`, background: b.tone }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {bands.map((b) => (
          <li key={b.label} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: b.tone }}
            />
            <span className="text-body flex-1 text-[12.5px]">{b.label}</span>
            <span className="text-strong tnum text-[13px] font-semibold">
              {b.value}
            </span>
            <span className="text-faint tnum w-11 text-right text-[11.5px]">
              {((b.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Timeline ──────────────────────────────────────────────────── */

/** Recent wins, as a vertical timeline. */
export function Timeline({
  items,
}: {
  items: { title: string; meta: string; tone?: "good" | "neutral" }[];
}) {
  if (!items.length) {
    return (
      <p className="text-faint py-6 text-center text-[12.5px]">
        Nothing recorded for this period yet.
      </p>
    );
  }
  return (
    <ol className="relative space-y-4">
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-[5px] w-px"
        style={{ background: "var(--line-soft)" }}
      />
      {items.map((item, i) => (
        <li key={i} className="relative flex gap-3.5 pl-0">
          <span
            aria-hidden
            className="relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-[var(--surface-raised)]"
            style={{
              background:
                item.tone === "good"
                  ? "var(--color-mint-500)"
                  : "var(--line-strong)",
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-body text-[13px] leading-5 font-medium">{item.title}</p>
            <p className="text-faint mt-0.5 text-[11.5px]">{item.meta}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Glossary ──────────────────────────────────────────────────── */

/** Plain-language definitions, so no one has to ask what a metric means. */
export function Glossary({
  terms,
}: {
  terms: { term: string; meaning: string }[];
}) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {terms.map((t) => (
        <div key={t.term}>
          <dt className="text-strong text-[13px] font-semibold">{t.term}</dt>
          <dd className="text-muted mt-1 text-[12.5px] leading-5">{t.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
