import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { listAnalytics } from "@/db/queries/analytics";
import { listBacklinks } from "@/db/queries/backlinks";
import { listKeywords } from "@/db/queries/keywords";
import { listPages } from "@/db/queries/pages";
import { getRankMatrix } from "@/db/queries/rankings";
import { projects } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { parseListQuery } from "@/lib/query";
import { currentMonthKey, monthLabel, slugify } from "@/lib/utils";

const ENTITIES = ["backlinks", "keywords", "pages", "analytics", "rankings"] as const;
type Entity = (typeof ENTITIES)[number];

/**
 * CSV export. Clients may export their own project, but never the internal
 * credential columns — those are dropped from the backlink projection.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (!ENTITIES.includes(entity as Entity)) {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? user.projectIds[0];
  if (!projectId || !user.projectIds.includes(projectId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isStaff = user.role !== "CLIENT";
  const month = url.searchParams.get("month") ?? currentMonthKey();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${slugify(project.name)}-${entity}-${stamp}.csv`;

  // Export everything that matches the current filters, not just one page.
  const query = {
    ...parseListQuery(Object.fromEntries(url.searchParams.entries())),
    page: 1,
    pageSize: 10000,
  };

  switch (entity as Entity) {
    case "backlinks": {
      const { rows } = await listBacklinks(projectId, query, {
        includeSecrets: isStaff,
      });
      return csvResponse(
        toCsv(rows, [
          { key: "url", header: "Backlink URL" },
          { key: "type", header: "Type" },
          { key: "status", header: "Status" },
          { key: "indexed", header: "Index (Y/N)", format: (r) => (r.indexed ? "Y" : "N") },
          { key: "anchorText1", header: "Anchor text 1" },
          { key: "anchorText2", header: "Anchor text 2" },
          { key: "publishedDate", header: "Date" },
          ...(isStaff
            ? [{ key: "assigneeName" as const, header: "Expert Name" }]
            : []),
          {
            key: "publishedDate",
            header: "Month",
            format: (r) => (r.publishedDate ? monthLabel(r.publishedDate) : ""),
          },
          { key: "da", header: "DA" },
          { key: "pa", header: "PA" },
          { key: "spamScore", header: "Spam Score" },
          ...(isStaff
            ? [
                { key: "loginUser" as const, header: "User" },
                { key: "loginPassword" as const, header: "Password" },
                { key: "notes" as const, header: "Notes" },
              ]
            : []),
        ]),
        filename,
      );
    }

    case "keywords": {
      const { rows } = await listKeywords(projectId, query, { month });
      return csvResponse(
        toCsv(rows, [
          { key: "keyword", header: "Keywords" },
          { key: "intent", header: "Intent" },
          { key: "volume", header: "Traffic" },
          { key: "kd", header: "KD" },
          { key: "cpc", header: "CPC" },
          { key: "pageTitle", header: "Page" },
          { key: "targetUrl", header: "Target URL" },
          { key: "focusKeyword", header: "Focus Keyword" },
          { key: "priority", header: "Priority", format: (r) => (r.priority ? "TRUE" : "FALSE") },
          { key: "backlinkTarget", header: "Target" },
          { key: "linksIndexed", header: "Backlinks indexed" },
          { key: "linksPublished", header: "Backlinks published" },
          { key: "linksThisMonth", header: `Links in ${monthLabel(month)}` },
          { key: "currentPosition", header: "Position" },
          { key: "currentPage", header: "Google Page" },
          { key: "bestPosition", header: "Best position" },
        ]),
        filename,
      );
    }

    case "pages": {
      const { rows } = await listPages(projectId, query, { month });
      return csvResponse(
        toCsv(rows, [
          { key: "title", header: "Page Title" },
          { key: "targetUrl", header: "Target URL" },
          { key: "focusKeyword", header: "Focus Keywords" },
          { key: "type", header: "Type" },
          {
            key: "onPageDone",
            header: "On Page Status",
            format: (r) => (r.onPageDone ? "TRUE" : "FALSE"),
          },
          { key: "seoScore", header: "SEO Score" },
          { key: "indexed", header: "Index", format: (r) => (r.indexed ? "TRUE" : "FALSE") },
          { key: "wordCount", header: "Content (Word Count)" },
          { key: "hasFaqs", header: "FAQs", format: (r) => (r.hasFaqs ? "TRUE" : "FALSE") },
          {
            key: "hasBlogSection",
            header: "Blog Section",
            format: (r) => (r.hasBlogSection ? "TRUE" : "FALSE"),
          },
          {
            key: "hasReviewSection",
            header: "Review Section",
            format: (r) => (r.hasReviewSection ? "TRUE" : "FALSE"),
          },
          {
            key: "hasCaseStudySection",
            header: "Case Study Section",
            format: (r) => (r.hasCaseStudySection ? "TRUE" : "FALSE"),
          },
          { key: "keywordCount", header: "Keywords" },
          { key: "page1Count", header: "Keywords on page 1" },
        ]),
        filename,
      );
    }

    case "analytics": {
      const rows = await listAnalytics(projectId);
      return csvResponse(
        toCsv(rows, [
          { key: "capturedOn", header: "Date" },
          { key: "label", header: "Month" },
          { key: "country", header: "Country" },
          { key: "clicks", header: "No of Clicks" },
          { key: "impressions", header: "Impressions" },
          {
            key: "keywordCount",
            header: "Keywords",
            format: (r) => r.keywordCountLabel ?? r.keywordCount ?? "",
          },
          { key: "gaTraffic", header: "Traffic" },
          { key: "ctr", header: "CTR %", format: (r) => r.ctr.toFixed(4) },
          {
            key: "impressionGrowth",
            header: "Impression Increment Rate %",
            format: (r) =>
              r.impressionGrowth === null ? "" : r.impressionGrowth.toFixed(2),
          },
        ]),
        filename,
      );
    }

    case "rankings": {
      // One column per month, matching the original sheet's shape.
      const matrix = await getRankMatrix(projectId, {
        window: 36,
        pageSize: 5000,
        page: 1,
      });
      // Flatten each row's month map into plain columns so the CSV mirrors the
      // original sheet: one column per month, oldest first.
      const flat = matrix.rows.map((row) => {
        const record: Record<string, unknown> = {
          keyword: row.keyword,
          pageTitle: row.pageTitle,
          volume: row.volume,
          backlinkTarget: row.backlinkTarget,
          best: row.best,
        };
        for (const { month } of matrix.monthLabels) {
          record[month] = row.cells[month]?.position ?? "";
        }
        return record;
      });

      return csvResponse(
        toCsv(flat, [
          { key: "keyword", header: "Keywords" },
          { key: "pageTitle", header: "Page" },
          { key: "volume", header: "Traffic" },
          { key: "backlinkTarget", header: "Target" },
          { key: "best", header: "Best position" },
          ...matrix.monthLabels.map((m) => ({ key: m.month, header: m.label })),
        ]),
        filename,
      );
    }
  }
}
