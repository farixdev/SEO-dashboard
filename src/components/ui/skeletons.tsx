import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   Shimmer placeholders.

   Each one mirrors the real component's box model — same heights, same
   grid, same gaps — so the swap to real content does not reflow the page.
   The shimmer sweep itself lives in the `skeleton` utility in globals.css.
   ════════════════════════════════════════════════════════════════ */

export function Shimmer({
  className,
  rounded = "xl",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}) {
  const radius = {
    sm: "rounded-md",
    md: "rounded-lg",
    lg: "rounded-2xl",
    xl: "rounded-xl",
    full: "rounded-full",
  }[rounded];
  return <div aria-hidden className={cn("skeleton", radius, className)} />;
}

/** Screen-reader announcement so a loading page is not silent. */
function Announce({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

/* ── Page header ───────────────────────────────────────────────── */

export function HeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-4 w-72" />
      </div>
      {withAction ? <Shimmer className="h-10 w-36 rounded-2xl" /> : null}
    </div>
  );
}

/* ── KPI tiles ─────────────────────────────────────────────────── */

export function StatCardsSkeleton({
  count = 4,
  withChart = false,
}: {
  count?: number;
  withChart?: boolean;
}) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2.5">
              <Shimmer className="h-3.5 w-24" />
              <Shimmer className="h-7 w-20" />
            </div>
            <Shimmer className="size-10 rounded-2xl" />
          </div>
          {withChart ? <Shimmer className="mt-3 h-2.5 w-full rounded-full" /> : null}
          <Shimmer className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** The compact `MiniStat` row used above most tables. */
export function MiniStatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={cn(
        "mb-5 grid gap-3 sm:grid-cols-2",
        count === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="well space-y-2 px-3.5 py-3">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-5 w-14" />
          <Shimmer className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/* ── Charts ────────────────────────────────────────────────────── */

export function ChartSkeleton({
  height = 260,
  title = true,
  className,
}: {
  height?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("panel", className)}>
      {title ? (
        <div className="space-y-2 px-5 pt-5 pb-4 sm:px-6">
          <Shimmer className="h-4 w-44" />
          <Shimmer className="h-3 w-64" />
        </div>
      ) : null}
      <div className="px-5 pb-5 sm:px-6">
        <ChartBodySkeleton height={height} />
      </div>
    </div>
  );
}

/** Bars of varying height, so it reads as a chart rather than a grey box. */
export function ChartBodySkeleton({ height = 260 }: { height?: number }) {
  // Fixed pattern rather than random, so the server and client markup match.
  const bars = [52, 74, 41, 88, 63, 96, 70, 55, 82, 47, 91, 68];
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((pct, i) => (
        <div key={i} className="flex h-full flex-1 items-end">
          <div className="skeleton w-full rounded-md" style={{ height: `${pct}%` }} />
        </div>
      ))}
      <span className="sr-only">Loading chart</span>
    </div>
  );
}

/* ── Tables ────────────────────────────────────────────────────── */

export function ToolbarSkeleton({ filters = 4 }: { filters?: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Shimmer className="h-9 w-full sm:w-72" />
      {Array.from({ length: filters }).map((_, i) => (
        <Shimmer key={i} className="h-9 w-28" />
      ))}
      <div className="ml-auto flex gap-2">
        <Shimmer className="h-8 w-28 rounded-xl" />
        <Shimmer className="h-8 w-28 rounded-xl" />
      </div>
    </div>
  );
}

export function TableSkeleton({
  rows = 12,
  columns = 8,
  label = "Loading table",
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  // Uneven widths make the placeholder read as tabular data.
  const widths = ["w-full", "w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"];
  return (
    <div className="panel overflow-hidden">
      <Announce label={label} />

      <div
        className="surface-panel flex items-center gap-4 border-b px-3 py-3"
        style={{ borderColor: "var(--line-strong)" }}
      >
        {Array.from({ length: columns }).map((_, c) => (
          <Shimmer key={c} className="h-3 flex-1" rounded="sm" />
        ))}
      </div>

      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b px-3 py-3.5 last:border-0"
          style={{ borderColor: "var(--line-soft)" }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="flex-1">
              <Shimmer
                className={cn("h-3.5", widths[(r + c) % widths.length])}
                rounded="sm"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PaginationSkeleton() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <Shimmer className="h-3.5 w-40" rounded="sm" />
        <Shimmer className="h-7 w-20" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="size-8" />
        ))}
      </div>
    </div>
  );
}

/** Full list-page shell: stats, toolbar, table, pager. */
export function ListPageSkeleton({
  stats = 4,
  filters = 4,
  columns = 8,
  rows = 12,
  header = false,
  label = "Loading",
}: {
  stats?: number;
  filters?: number;
  columns?: number;
  rows?: number;
  header?: boolean;
  label?: string;
}) {
  return (
    <>
      {header ? <HeaderSkeleton withAction={false} /> : null}
      <MiniStatsSkeleton count={stats} />
      <ToolbarSkeleton filters={filters} />
      <TableSkeleton rows={rows} columns={columns} label={label} />
      <PaginationSkeleton />
    </>
  );
}

/* ── Cards ─────────────────────────────────────────────────────── */

export function ProjectCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Shimmer className="h-4 w-40" />
              <Shimmer className="h-3 w-52" />
            </div>
            <Shimmer className="h-5 w-16 rounded-lg" />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, m) => (
              <div key={m} className="well space-y-1.5 px-2 py-2">
                <Shimmer className="mx-auto h-4 w-10" rounded="sm" />
                <Shimmer className="mx-auto h-2.5 w-12" rounded="sm" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Shimmer className="h-3 w-full" rounded="sm" />
            <Shimmer className="h-2.5 w-full rounded-full" />
          </div>
          <div
            className="mt-4 flex items-center justify-between border-t pt-3.5"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <div className="flex -space-x-2">
              {Array.from({ length: 3 }).map((_, a) => (
                <Shimmer key={a} className="size-7" rounded="full" />
              ))}
            </div>
            <Shimmer className="h-3 w-12" rounded="sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Right-hand rail on the agency home page. */
export function SidePanelSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="panel p-5">
      <Shimmer className="mb-4 h-4 w-36" />
      <div className="space-y-3">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex gap-2.5">
            <Shimmer className="mt-1.5 size-1.5 shrink-0" rounded="full" />
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-3 w-full" rounded="sm" />
              <Shimmer className="h-2.5 w-2/3" rounded="sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboards ────────────────────────────────────────────────── */

export function TargetRingsSkeleton() {
  return (
    <div className="panel mb-6">
      <div className="space-y-2 px-5 pt-5 pb-4 sm:px-6">
        <Shimmer className="h-4 w-56" />
        <Shimmer className="h-3 w-80" />
      </div>
      <div className="px-5 pb-5 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Shimmer className="size-[84px] shrink-0" rounded="full" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-24" rounded="sm" />
                <Shimmer className="h-5 w-16" rounded="sm" />
                <Shimmer className="h-2.5 w-12" rounded="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The chart grid on both overview pages. */
export function DashboardChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartSkeleton height={280} className="lg:col-span-2" />
      <ChartSkeleton height={260} />
      <ChartSkeleton height={240} />
      <ChartSkeleton height={220} />
      <ChartSkeleton height={240} />
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Shimmer className="h-3 w-28" rounded="sm" />
          <Shimmer className="h-4 w-36" rounded="sm" />
        </div>
        <Shimmer className="h-10 w-44 rounded-2xl" />
      </div>
      <StatCardsSkeleton withChart />
      <TargetRingsSkeleton />
      <DashboardChartsSkeleton />
    </>
  );
}

/* ── Rank grid ─────────────────────────────────────────────────── */

export function RankMatrixSkeleton({ months = 12 }: { months?: number }) {
  return (
    <div className="panel overflow-hidden">
      <Announce label="Loading rank history" />
      <div
        className="surface-panel flex items-center gap-3 border-b px-3 py-3"
        style={{ borderColor: "var(--line-strong)" }}
      >
        <Shimmer className="h-3 w-6" rounded="sm" />
        <Shimmer className="h-3 w-44" rounded="sm" />
        <Shimmer className="h-3 w-14" rounded="sm" />
        {Array.from({ length: months }).map((_, i) => (
          <Shimmer key={i} className="h-3 w-10 shrink-0" rounded="sm" />
        ))}
      </div>
      {Array.from({ length: 14 }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-3 border-b px-3 py-3 last:border-0"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <Shimmer className="size-3 shrink-0" rounded="sm" />
          <Shimmer className="h-3.5 w-44 shrink-0" rounded="sm" />
          <Shimmer className="h-3.5 w-14 shrink-0" rounded="sm" />
          {Array.from({ length: months }).map((_, c) => (
            <Shimmer
              key={c}
              className={cn("h-5 w-10 shrink-0", (r + c) % 3 === 0 && "opacity-40")}
              rounded="sm"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Board ─────────────────────────────────────────────────────── */

export function TaskBoardSkeleton() {
  const perColumn = [3, 4, 2, 5];
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {perColumn.map((cards, col) => (
        <section key={col} className="flex flex-col">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <Shimmer className="h-3 w-24" rounded="sm" />
            <Shimmer className="size-4" rounded="sm" />
          </div>
          <div className="well flex min-h-32 flex-1 flex-col gap-2 p-2">
            {Array.from({ length: cards }).map((_, i) => (
              <div key={i} className="panel-sm space-y-2.5 p-3">
                <Shimmer className="h-3.5 w-full" rounded="sm" />
                <Shimmer className="h-3 w-3/4" rounded="sm" />
                <div className="flex gap-1.5">
                  <Shimmer className="h-4 w-14 rounded-lg" />
                  <Shimmer className="h-4 w-16 rounded-lg" />
                </div>
                <div
                  className="flex items-center gap-2 border-t pt-2.5"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <Shimmer className="size-6" rounded="full" />
                  <Shimmer className="h-3 w-20" rounded="sm" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Messaging ─────────────────────────────────────────────────── */

export function MessagesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="panel max-h-[calc(100dvh-19rem)] min-h-[420px] overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <Shimmer className="h-3.5 w-28" rounded="sm" />
          <Shimmer className="h-7 w-16 rounded-xl" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-2.5 border-b px-4 py-3 last:border-0"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <Shimmer className="size-7 shrink-0" rounded="full" />
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-3.5 w-3/4" rounded="sm" />
              <Shimmer className="h-3 w-full" rounded="sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="panel flex h-[calc(100dvh-19rem)] min-h-[420px] flex-col">
        <div
          className="space-y-2 border-b px-5 py-4"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <Shimmer className="h-4 w-56" rounded="sm" />
          <Shimmer className="h-3 w-24" rounded="sm" />
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn("flex gap-2.5", i % 2 === 1 && "flex-row-reverse")}
            >
              <Shimmer className="size-7 shrink-0" rounded="full" />
              <Shimmer
                className={cn("h-16 rounded-2xl", i % 2 === 1 ? "w-1/2" : "w-2/3")}
              />
            </div>
          ))}
        </div>
        <div
          className="flex gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <Shimmer className="h-11 flex-1" />
          <Shimmer className="h-11 w-24 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/* ── Forms ─────────────────────────────────────────────────────── */

export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="panel">
          <div className="space-y-2 px-5 pt-5 pb-4 sm:px-6">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="h-3 w-64" />
          </div>
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6">
            {Array.from({ length: 4 }).map((_, f) => (
              <div key={f} className="space-y-1.5">
                <Shimmer className="h-3 w-24" rounded="sm" />
                <Shimmer className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Report ────────────────────────────────────────────────────── */

export function ReportSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="mb-8 space-y-2">
        <Shimmer className="h-3 w-40" rounded="sm" />
        <Shimmer className="h-7 w-64" />
        <Shimmer className="h-4 w-48" rounded="sm" />
      </div>
      <div className="panel mb-6 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="well space-y-2 px-4 py-3.5">
              <Shimmer className="h-3 w-24" rounded="sm" />
              <Shimmer className="h-6 w-16" rounded="sm" />
              <Shimmer className="h-2.5 w-28" rounded="sm" />
            </div>
          ))}
        </div>
      </div>
      <ChartSkeleton height={280} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton height={240} />
        <ChartSkeleton height={240} />
      </div>
    </>
  );
}
