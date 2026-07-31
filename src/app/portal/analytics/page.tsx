import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MiniStat } from "@/components/charts/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { listAnalytics, summariseAnalytics } from "@/db/queries/analytics";
import { AnalyticsView } from "@/features/analytics/analytics-view";
import { HELP } from "@/lib/help";
import { requirePortalProject } from "@/lib/portal";
import { compactNumber, formatNumber, formatPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Search performance" };

export default async function PortalAnalyticsPage() {
  const { projectId } = await requirePortalProject();

  const rows = await listAnalytics(projectId);
  const summary = summariseAnalytics(rows);

  return (
    <>
      <PageHeader
          help={HELP.analytics}
        title="Search performance"
        description="Straight from Google Search Console and Analytics: how often you appear, and how many people visit."
        action={
          <Link href={`/api/export/analytics?projectId=${projectId}`} prefetch={false}>
            <Button variant="secondary">
              <Download className="size-4" />
              Export CSV
            </Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          label="Total clicks"
          value={formatNumber(summary.totalClicks)}
          sublabel={`across ${rows.length} month${rows.length === 1 ? "" : "s"}`}
        />
        <MiniStat
          label="Total impressions"
          value={compactNumber(summary.totalImpressions)}
          tone="info"
          sublabel="times you appeared in results"
        />
        <MiniStat
          label="Click-through rate"
          value={formatPercent(summary.avgCtr, 2)}
          tone="brand"
        />
        <MiniStat
          label="Growth since we started"
          value={
            summary.impressionsGrowthAllTime != null
              ? `${summary.impressionsGrowthAllTime > 0 ? "+" : ""}${summary.impressionsGrowthAllTime.toFixed(0)}%`
              : "—"
          }
          tone={
            (summary.impressionsGrowthAllTime ?? 0) >= 0 ? "success" : "warning"
          }
          sublabel="in search impressions"
        />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="What these numbers mean"
          description="A quick guide to the columns below."
        />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Impressions",
                "How many times a page of your site appeared in Google's results.",
              ],
              ["Clicks", "How many of those impressions turned into a visit."],
              [
                "CTR",
                "Clicks divided by impressions — how compelling your listing is.",
              ],
              [
                "GA sessions",
                "Organic visits recorded in Google Analytics for the month.",
              ],
            ].map(([term, meaning]) => (
              <div key={term} className="well px-3 py-2.5">
                <dt className="text-strong text-[12.5px] font-semibold">{term}</dt>
                <dd className="text-muted mt-0.5 text-[11.5px] leading-[1.45]">
                  {meaning}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <AnalyticsView projectId={projectId} rows={rows} canEdit={false} />
    </>
  );
}
