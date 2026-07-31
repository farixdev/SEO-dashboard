"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn, compactNumber } from "@/lib/utils";

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

const AXIS = {
  stroke: "var(--line-soft)",
  tick: { fill: "var(--text-faint)", fontSize: 11 },
  tickLine: false,
} as const;

/* ── Shared tooltip ────────────────────────────────────────────── */

type TooltipEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

function ClayTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel-sm px-3 py-2 text-[12px]">
      {label !== undefined ? (
        <p className="text-strong mb-1 font-semibold">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      ) : null}
      <div className="space-y-0.5">
        {payload.map((entry, i) => {
          const value = Number(entry.value ?? 0);
          const name = String(entry.name ?? entry.dataKey ?? "");
          return (
            <div key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-muted">{name}</span>
              <span className="text-strong tnum ml-auto pl-3 font-semibold">
                {formatter ? formatter(value, name) : compactNumber(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Chart frame ───────────────────────────────────────────────── */

export function ChartFrame({
  height = 240,
  children,
  className,
}: {
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

/* ── Area trend (impressions, clicks, traffic) ─────────────────── */

export type SeriesDef = {
  key: string;
  label: string;
  color?: string;
  /** plot on the right-hand axis (for wildly different magnitudes) */
  axis?: "left" | "right";
};

export function AreaTrendChart({
  data,
  series,
  xKey = "label",
  height = 260,
  valueFormatter,
}: {
  data: Record<string, unknown>[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  valueFormatter?: (value: number, name: string) => string;
}) {
  const hasRight = series.some((s) => s.axis === "right");
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: hasRight ? 4 : 12, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient
              key={s.key}
              id={`grad-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                stopOpacity={0.02}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--line-soft)"
          vertical={false}
        />
        <XAxis dataKey={xKey} {...AXIS} axisLine={false} minTickGap={16} />
        <YAxis
          {...AXIS}
          axisLine={false}
          width={54}
          tickFormatter={(v) => compactNumber(Number(v))}
        />
        {hasRight ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            {...AXIS}
            axisLine={false}
            width={46}
            tickFormatter={(v) => compactNumber(Number(v))}
          />
        ) : null}
        <Tooltip
          content={<ClayTooltip formatter={valueFormatter} />}
          cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
        />
        {series.length > 1 ? (
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          />
        ) : null}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            yAxisId={s.axis === "right" ? "right" : undefined}
            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-raised)" }}
            connectNulls
          />
        ))}
      </AreaChart>
    </ChartFrame>
  );
}

/* ── Bar series (links per month, team output) ──────────────────── */

export function BarSeriesChart({
  data,
  series,
  xKey = "label",
  height = 260,
  stacked = false,
  horizontal = false,
  valueFormatter,
}: {
  data: Record<string, unknown>[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  valueFormatter?: (value: number, name: string) => string;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{
          top: 8,
          right: 12,
          left: horizontal ? 8 : -18,
          bottom: 0,
        }}
        barCategoryGap={horizontal ? "22%" : "28%"}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--line-soft)"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              {...AXIS}
              axisLine={false}
              tickFormatter={(v) => compactNumber(Number(v))}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              {...AXIS}
              axisLine={false}
              width={130}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS} axisLine={false} minTickGap={8} />
            <YAxis
              {...AXIS}
              axisLine={false}
              width={54}
              tickFormatter={(v) => compactNumber(Number(v))}
            />
          </>
        )}
        <Tooltip
          content={<ClayTooltip formatter={valueFormatter} />}
          cursor={{ fill: "var(--surface-hover)" }}
        />
        {series.length > 1 ? (
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          />
        ) : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? "a" : undefined}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={
              horizontal
                ? [0, 6, 6, 0]
                : stacked && i < series.length - 1
                  ? [0, 0, 0, 0]
                  : [6, 6, 0, 0]
            }
            maxBarSize={horizontal ? 22 : 44}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/** Single-series bar where each category gets its own colour. */
export function CategoryBarChart({
  data,
  height = 260,
  horizontal = true,
  nameKey = "label",
  valueKey = "value",
}: {
  data: { label: string; value: number }[];
  height?: number;
  horizontal?: boolean;
  nameKey?: string;
  valueKey?: string;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 20, left: horizontal ? 4 : -18, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--line-soft)"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              {...AXIS}
              axisLine={false}
              tickFormatter={(v) => compactNumber(Number(v))}
            />
            <YAxis
              type="category"
              dataKey={nameKey}
              {...AXIS}
              axisLine={false}
              width={140}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} {...AXIS} axisLine={false} />
            <YAxis {...AXIS} axisLine={false} width={48} />
          </>
        )}
        <Tooltip content={<ClayTooltip />} cursor={{ fill: "var(--surface-hover)" }} />
        <Bar
          dataKey={valueKey}
          name="Links"
          radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
          maxBarSize={horizontal ? 20 : 40}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/* ── Donut (link type split) ───────────────────────────────────── */

export function DonutChart({
  data,
  height = 240,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  return (
    <div className="relative">
      <ChartFrame height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ClayTooltip
                formatter={(value) =>
                  `${compactNumber(value)} (${total ? ((value / total) * 100).toFixed(1) : 0}%)`
                }
              />
            }
          />
        </PieChart>
      </ChartFrame>
      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-strong tnum text-xl font-semibold">{centerValue}</div>
            {centerLabel ? (
              <div className="text-faint text-[11px]">{centerLabel}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Legend rendered outside the donut so long labels stay readable. */
export function ChartLegend({
  data,
  total,
  className,
}: {
  data: { label: string; value: number }[];
  total?: number;
  className?: string;
}) {
  const sum = total ?? data.reduce((acc, d) => acc + d.value, 0);
  return (
    <ul className={cn("space-y-1.5", className)}>
      {data.map((d, i) => (
        <li key={d.label} className="flex items-center gap-2 text-[12.5px]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="text-body min-w-0 flex-1 truncate">{d.label}</span>
          <span className="text-strong tnum font-semibold">{d.value.toLocaleString()}</span>
          <span className="text-faint tnum w-11 text-right text-[11.5px]">
            {sum ? ((d.value / sum) * 100).toFixed(1) : "0.0"}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Rank position line (inverted — lower is better) ───────────── */

export function RankLineChart({
  data,
  height = 240,
  seriesLabel = "Position",
}: {
  data: { label: string; position: number | null }[];
  height?: number;
  seriesLabel?: string;
}) {
  const values = data.map((d) => d.position).filter((v): v is number => v != null);
  const max = values.length ? Math.max(...values) : 100;
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} axisLine={false} minTickGap={12} />
        <YAxis
          {...AXIS}
          axisLine={false}
          width={44}
          // Rank 1 belongs at the top.
          reversed
          domain={[1, Math.max(10, Math.ceil(max / 10) * 10)]}
          allowDecimals={false}
        />
        <Tooltip
          content={
            <ClayTooltip formatter={(v) => (v ? `#${v.toFixed(1)}` : "Not ranking")} />
          }
          cursor={{ stroke: "var(--line-strong)" }}
        />
        <Line
          type="monotone"
          dataKey="position"
          name={seriesLabel}
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          dot={{ r: 3, strokeWidth: 0, fill: "var(--color-chart-1)" }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface-raised)" }}
          connectNulls
        />
      </LineChart>
    </ChartFrame>
  );
}

/* ── Sparkline (inline, no axes) ───────────────────────────────── */

export function Sparkline({
  data,
  dataKey = "value",
  color = "var(--color-chart-1)",
  height = 36,
  invert = false,
}: {
  data: Record<string, unknown>[];
  dataKey?: string;
  color?: string;
  height?: number;
  /** for rank series, where down is good */
  invert?: boolean;
}) {
  if (!data.length) return <div style={{ height }} />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide reversed={invert} domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${dataKey}-${color})`}
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
