"use client";

import {
  AreaTrendChart,
  BarSeriesChart,
  CategoryBarChart,
  ChartLegend,
  DonutChart,
  RankLineChart,
  Sparkline,
} from "./primitives";

/* Thin client wrappers so server pages can render charts without becoming
   client components themselves. */

export function SearchTrendChart({
  data,
}: {
  data: { label: string; clicks: number; impressions: number; traffic: number }[];
}) {
  return (
    <AreaTrendChart
      data={data}
      height={280}
      series={[
        {
          key: "impressions",
          label: "Impressions",
          color: "var(--color-chart-3)",
        },
        { key: "clicks", label: "Clicks", color: "var(--color-chart-1)", axis: "right" },
        {
          key: "traffic",
          label: "GA sessions",
          color: "var(--color-chart-2)",
          axis: "right",
        },
      ]}
    />
  );
}

export function CtrTrendChart({
  data,
}: {
  data: { label: string; ctr: number }[];
}) {
  return (
    <AreaTrendChart
      data={data}
      height={200}
      valueFormatter={(v) => `${v.toFixed(2)}%`}
      series={[{ key: "ctr", label: "CTR", color: "var(--color-chart-4)" }]}
    />
  );
}

export function LinksByMonthChart({
  data,
}: {
  data: { label: string; value: number; indexed: number }[];
}) {
  return (
    <BarSeriesChart
      data={data}
      height={260}
      stacked
      series={[
        { key: "indexed", label: "Indexed", color: "var(--color-chart-2)" },
        { key: "value", label: "Total built", color: "var(--color-chart-1)" },
      ]}
    />
  );
}

export function LinkTypeDonut({
  data,
  total,
}: {
  data: { label: string; value: number }[];
  total: number;
}) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <DonutChart
        data={data}
        height={200}
        centerValue={total.toLocaleString()}
        centerLabel="total links"
      />
      <ChartLegend data={data} total={total} />
    </div>
  );
}

export function RankDistributionChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return <CategoryBarChart data={data} height={220} horizontal />;
}

export function AveragePositionChart({
  data,
}: {
  data: { label: string; position: number | null }[];
}) {
  return <RankLineChart data={data} height={240} seriesLabel="Avg. position" />;
}

export function PageOneTrendChart({
  data,
}: {
  data: { label: string; page1: number; top3: number }[];
}) {
  return (
    <AreaTrendChart
      data={data}
      height={240}
      series={[
        { key: "page1", label: "Page 1", color: "var(--color-chart-2)" },
        { key: "top3", label: "Top 3", color: "var(--color-chart-1)" },
      ]}
    />
  );
}

export function TeamOutputChart({
  data,
  people,
}: {
  data: Record<string, string | number>[];
  people: string[];
}) {
  return (
    <BarSeriesChart
      data={data}
      xKey="month"
      height={280}
      stacked
      series={people.map((name) => ({ key: name, label: name }))}
    />
  );
}

export function AnchorChart({ data }: { data: { label: string; value: number }[] }) {
  return <CategoryBarChart data={data} height={Math.max(200, data.length * 26)} horizontal />;
}

export function AuthorityChart({
  data,
  total,
}: {
  data: { label: string; value: number }[];
  total: number;
}) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <DonutChart data={data} height={180} centerValue={total.toLocaleString()} centerLabel="links" />
      <ChartLegend data={data} total={total} />
    </div>
  );
}

export function MiniSpark({
  data,
  color,
  invert,
}: {
  data: { value: number }[];
  color?: string;
  invert?: boolean;
}) {
  return <Sparkline data={data} color={color} invert={invert} height={34} />;
}

export { ChartLegend };
