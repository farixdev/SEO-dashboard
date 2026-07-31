"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { parseTable } from "@/lib/csv";
import { currentMonthKey } from "@/lib/utils";

import { type ImportReport, importDataAction } from "./actions";

type Entity = "backlinks" | "keywords" | "pages" | "analytics" | "rankings";

const ENTITY_TABS: { value: Entity; label: string }[] = [
  { value: "backlinks", label: "Backlinks" },
  { value: "keywords", label: "Keywords" },
  { value: "pages", label: "On-page" },
  { value: "analytics", label: "Search data" },
  { value: "rankings", label: "Rankings" },
];

/** Column guidance per entity, using the original workbook's header names. */
const GUIDES: Record<
  Entity,
  { sheet: string; required: string[]; optional: string[]; note?: string }
> = {
  backlinks: {
    sheet: "Backlinks",
    required: ["Backlinks (the URL)"],
    optional: [
      "Type",
      "Status",
      "Index (Y/N)",
      "Anchor text 1",
      "Anchor text 2",
      "Date",
      "Expert Name",
      "DA",
      "PA",
      "Spam Score",
      "User",
      "Password",
      "Notes",
    ],
    note: "Rows are matched on URL — re-importing the same sheet updates existing links instead of duplicating them.",
  },
  keywords: {
    sheet: "Keywords List",
    required: ["Keywords"],
    optional: [
      "Intent",
      "Traffic (search volume)",
      "KD",
      "CPC",
      "Competition",
      "Ads",
      "Page",
      "Priority",
      "Target",
      "Monthly Target",
    ],
    note: "“Page” must match a page title exactly. Tick “create missing pages” and they will be created for you.",
  },
  pages: {
    sheet: "On Page SEO",
    required: ["Page Title"],
    optional: [
      "Target URL",
      "Focus Keywords",
      "Type",
      "On Page Status",
      "SEO Score",
      "Index",
      "Content (Word Count)",
      "FAQs",
      "Blog Section",
      "Review Section",
      "Case Study Section",
    ],
    note: "Matched on page title, so re-importing updates rather than duplicating.",
  },
  analytics: {
    sheet: "Analytics and Search Console Data",
    required: ["Month (or Date)"],
    optional: [
      "Country",
      "No of Clicks",
      "Impressions",
      "Keywords",
      "Traffic (GA sessions)",
    ],
    note: "CTR and impression growth are recalculated — do not paste those columns.",
  },
  rankings: {
    sheet: "Keyword Analysis",
    required: ["Keywords", "Position"],
    optional: ["Month", "Page", "Date"],
    note: "Keywords must already exist in the project. Set the month below unless your paste includes a Month column.",
  },
};

export function ImportPanel({
  projectId,
  defaultEntity = "backlinks",
}: {
  projectId: string;
  defaultEntity?: Entity;
}) {
  const [entity, setEntity] = useState<Entity>(defaultEntity);
  const [content, setContent] = useState("");
  const [state, action, pending] = useActionState(importDataAction, idle);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const report = state.ok ? (state.data as ImportReport | undefined) : undefined;

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success("Import finished", state.message);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the textarea in response to a server action result
      setContent("");
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Live preview of what we detected in the paste.
  const preview = useMemo(() => {
    if (!content.trim()) return null;
    const table = parseTable(content.slice(0, 200_000));
    return {
      headers: table.headers,
      rowCount: parseTable(content).rows.length,
      sample: table.rows.slice(0, 5),
      delimiter:
        table.delimiter === "\t"
          ? "tab"
          : table.delimiter === ","
            ? "comma"
            : table.delimiter,
    };
  }, [content]);

  const guide = GUIDES[entity];

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("That file is larger than 8 MB.", "Split it and import in parts.");
      return;
    }
    const text = await file.text();
    setContent(text);
    toast.info("File loaded", "Check the preview, then import.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Tabs
          items={ENTITY_TABS}
          value={entity}
          onChange={(v) => setEntity(v as Entity)}
        />

        <form action={action}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="entity" value={entity} />

          <Card>
            <CardHeader
              title={`Paste ${ENTITY_TABS.find((t) => t.value === entity)?.label.toLowerCase()} rows`}
              description={`Copy the ${guide.sheet} sheet straight out of Excel or Google Sheets — including the header row — and paste below.`}
              icon={<ClipboardPaste className="size-4" />}
              action={
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileSpreadsheet className="size-4" />
                    Load a CSV
                  </Button>
                </>
              }
            />
            <CardBody className="space-y-4">
              <textarea
                name="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={14}
                spellCheck={false}
                placeholder={placeholderFor(entity)}
                aria-label="Rows to import"
                className="surface-sunken text-strong w-full resize-y rounded-xl px-3 py-2.5 font-mono text-[12px] leading-5 shadow-[var(--inset-well)] placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none"
              />

              {entity === "keywords" ? (
                <Checkbox
                  label="Create pages that do not exist yet"
                  description="Any value in the “Page” column without a matching page becomes a new page."
                  name="createMissing"
                  defaultChecked
                />
              ) : null}

              {entity === "rankings" ? (
                <Input
                  label="Month these positions belong to"
                  name="month"
                  type="month"
                  defaultValue={currentMonthKey().slice(0, 7)}
                  help="Ignored for rows that carry their own Month column."
                  containerClassName="max-w-52"
                />
              ) : null}

              {state.errors?.content ? (
                <p className="text-[12px] text-[var(--color-rose-600)]">
                  {state.errors.content}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <p className="text-faint text-[12px]">
                  {preview
                    ? `${preview.rowCount.toLocaleString()} data row${preview.rowCount === 1 ? "" : "s"} detected (${preview.delimiter}-separated)`
                    : "Nothing pasted yet."}
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  loading={pending}
                  disabled={!content.trim()}
                >
                  <Upload className="size-4" />
                  Import {preview ? `${preview.rowCount.toLocaleString()} rows` : ""}
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>

        {/* ── Detected columns ── */}
        {preview && preview.headers.length > 0 ? (
          <Card>
            <CardHeader
              title="Detected columns"
              description="Header names are matched loosely — case, spacing and punctuation are ignored."
            />
            <CardBody>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {preview.headers.map((h, i) => (
                  <Badge key={`${h}-${i}`} tone="neutral">
                    {h || `(column ${i + 1})`}
                  </Badge>
                ))}
              </div>
              {preview.sample.length ? (
                <div className="well overflow-x-auto p-3">
                  <table className="w-full text-left text-[11.5px]">
                    <tbody>
                      {preview.sample.map((row, i) => (
                        <tr key={i}>
                          {preview.headers.map((h, ci) => (
                            <td
                              key={ci}
                              className="text-muted max-w-[16ch] truncate py-1 pr-3"
                            >
                              {Object.values(row)[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {/* ── Result ── */}
        {report ? (
          <Card>
            <CardHeader
              title="Import result"
              icon={<CheckCircle2 className="size-4" />}
            />
            <CardBody>
              <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <ResultTile label="Rows read" value={report.parsed} />
                <ResultTile label="Added" value={report.inserted} tone="success" />
                <ResultTile label="Updated" value={report.updated} tone="info" />
                <ResultTile
                  label="Skipped"
                  value={report.skipped}
                  tone={report.skipped > 0 ? "warning" : "neutral"}
                />
              </div>

              {report.created?.pages ? (
                <p className="text-muted mb-2 text-[12.5px]">
                  Also created {report.created.pages} new page
                  {report.created.pages === 1 ? "" : "s"} referenced by the keywords.
                </p>
              ) : null}

              {report.warnings.length ? (
                <ul className="space-y-2">
                  {report.warnings.map((warning, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--color-amber-500)_14%,transparent)] px-3 py-2.5"
                    >
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-[var(--color-amber-600)]" />
                      <span className="text-[12.5px] leading-[1.45] text-[var(--color-amber-700)] dark:text-[var(--color-amber-500)]">
                        {warning}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>

      {/* ── Column reference ── */}
      <aside className="space-y-4">
        <Card>
          <CardHeader
            title="Column reference"
            description={`Matches the “${guide.sheet}” sheet.`}
          />
          <CardBody className="space-y-4">
            <div>
              <p className="text-muted mb-1.5 text-[11.5px] font-semibold tracking-wider uppercase">
                Required
              </p>
              <ul className="space-y-1">
                {guide.required.map((c) => (
                  <li key={c} className="text-body text-[12.5px]">
                    <code className="surface-sunken rounded px-1 py-0.5 font-mono text-[11.5px]">
                      {c}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-muted mb-1.5 text-[11.5px] font-semibold tracking-wider uppercase">
                Optional
              </p>
              <div className="flex flex-wrap gap-1">
                {guide.optional.map((c) => (
                  <code
                    key={c}
                    className="surface-sunken text-muted rounded px-1.5 py-0.5 font-mono text-[11px]"
                  >
                    {c}
                  </code>
                ))}
              </div>
            </div>
            {guide.note ? (
              <p className="text-faint border-t pt-3 text-[12px] leading-[1.5]" style={{ borderColor: "var(--line-soft)" }}>
                {guide.note}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recommended order" />
          <CardBody>
            <ol className="space-y-2">
              {[
                ["On-page", "pages come first so keywords can map to them"],
                ["Keywords", "the terms you track, mapped to those pages"],
                ["Backlinks", "anchor text links each one to a keyword"],
                ["Rankings", "monthly positions for existing keywords"],
                ["Search data", "Search Console and GA totals per month"],
              ].map(([label, why], i) => (
                <li key={label} className="flex gap-2.5">
                  <span className="surface-sunken text-muted grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="text-body block text-[12.5px] font-medium">
                      {label}
                    </span>
                    <span className="text-faint block text-[11.5px] leading-4">
                      {why}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function ResultTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "info" | "warning";
}) {
  const colors = {
    neutral: "text-strong",
    success: "text-[var(--color-mint-600)]",
    info: "text-[var(--color-sky-600)]",
    warning: "text-[var(--color-amber-600)]",
  } as const;
  return (
    <div className="well px-3 py-2.5">
      <p className="text-faint text-[11px]">{label}</p>
      <p className={`tnum text-[18px] font-semibold ${colors[tone]}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function placeholderFor(entity: Entity) {
  switch (entity) {
    case "backlinks":
      return `Backlinks\tType\tStatus\tIndex (Y/N)\tAnchor text 1\tDate\tExpert Name\tDA\tPA\tSpam Score
https://medium.com/@you/post\tGuest Posts\tPublished\tY\tdigital marketing agency\t2024-09-10\tAbu Turab\t42\t49\t4`;
    case "keywords":
      return `Keywords\tIntent\tTraffic\tKD\tCPC\tPage\tPriority\tTarget
seo audit services\tTransactional\t170\t23\t0\tSEO audit services\tTRUE\t10`;
    case "pages":
      return `Page Title\tTarget URL\tFocus Keywords\tType\tOn Page Status\tSEO Score\tIndex\tContent (Word Count)\tFAQs
SEO services\thttps://example.com/seo/\tSEO Services\tService Page\tTRUE\t80+\tTRUE\t1004\tTRUE`;
    case "analytics":
      return `Date\tMonth\tCountry\tNo of Clicks\tImpressions\tKeywords\tTraffic
2026-06-26\tJun,26\tCanada\t9\t118003\t1000+\t18`;
    case "rankings":
      return `Keywords\tPosition\tPage
seo audit services\t7\t1
local seo services\t14\t2`;
  }
}
