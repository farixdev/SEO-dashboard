"use client";

import {
  Check,
  ExternalLink,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  Table,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  TrEmpty,
} from "@/components/tables/data-table";
import { SortHeader } from "@/components/tables/toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { PageRow } from "@/db/queries/pages";
import { idle } from "@/lib/action-state";
import {
  PAGE_HEALTH_LABELS,
  PAGE_TYPES,
  SEO_SCORE_BUCKETS,
  type PageHealth,
  pageHealth,
} from "@/lib/constants";
import { cn, formatNumber, prettyUrl } from "@/lib/utils";

import {
  bulkUpdatePagesAction,
  deletePageAction,
  togglePageFlagAction,
} from "./actions";
import { PageForm } from "./page-form";

/** Mirrors the workbook's green / amber / red row colouring. */
const HEALTH_DOT: Record<PageHealth, string> = {
  strong: "bg-[var(--color-mint-500)]",
  fair: "bg-[var(--color-amber-500)]",
  weak: "bg-[var(--color-rose-500)]",
  mixed: "bg-[var(--line-strong)]",
};

const TYPE_TONES: Record<string, "brand" | "info" | "success" | "warning" | "neutral"> = {
  "Service Page": "brand",
  "Location Page": "info",
  Blog: "neutral",
  "Case Study Page": "success",
  "Landing Page": "warning",
};

export function PagesTable({
  projectId,
  rows,
  canEdit,
}: {
  projectId: string;
  rows: PageRow[];
  canEdit: boolean;
}) {
  const [selectedRaw, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PageRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageRow | null>(null);

  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  // Selections for rows that are no longer on this page are ignored rather
  // than pruned in an effect: derived during render, so there is no second
  // render pass and no moment where a bulk action could act on a stale id.
  const selected = useMemo(
    () => new Set([...selectedRaw].filter((id) => visibleIds.has(id))),
    [selectedRaw, visibleIds],
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const columnCount = canEdit ? 13 : 11;

  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <BulkBar
            projectId={projectId}
            ids={[...selected]}
            onDone={() => setSelected(new Set())}
          />
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add page
          </Button>
        </div>
      ) : null}

      <TableShell>
        <Table minWidth={canEdit ? 1240 : 1080}>
          <Thead>
            {canEdit ? (
              <Th width={38}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                  aria-label="Select all pages on this page"
                  className="size-3.5 cursor-pointer accent-[var(--accent)]"
                />
              </Th>
            ) : null}
            <Th>
              <SortHeader column="title" defaultDir="asc">
                Page
              </SortHeader>
            </Th>
            <Th width={130}>
              <SortHeader column="type" defaultDir="asc">
                Type
              </SortHeader>
            </Th>
            <Th width={92} align="center">
              <SortHeader column="onPageDone" align="center">
                On-page
              </SortHeader>
            </Th>
            <Th width={82} align="center">
              <SortHeader column="seoScore" align="center">
                Score
              </SortHeader>
            </Th>
            <Th width={76} align="center">
              <SortHeader column="indexed" align="center">
                Index
              </SortHeader>
            </Th>
            <Th width={82} align="right">
              <SortHeader column="wordCount" align="right">
                Words
              </SortHeader>
            </Th>
            <Th width={54} align="center" title="FAQ section">
              FAQ
            </Th>
            <Th width={54} align="center" title="Blog section">
              Blog
            </Th>
            <Th width={64} align="center" title="Reviews section">
              Review
            </Th>
            <Th width={64} align="center" title="Case study section">
              Case
            </Th>
            <Th width={110} align="right">
              Keywords
            </Th>
            {canEdit ? <Th width={78} align="right" /> : null}
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <TrEmpty colSpan={columnCount}>
                <EmptyState
                  title="No pages match these filters"
                  description="Clear the filters, or add the pages you are optimising."
                  action={
                    canEdit ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="size-4" />
                        Add page
                      </Button>
                    ) : undefined
                  }
                />
              </TrEmpty>
            ) : (
              rows.map((row) => (
                <Tr key={row.id} highlight={selected.has(row.id)}>
                  {canEdit ? (
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${row.title}`}
                        className="size-3.5 cursor-pointer accent-[var(--accent)]"
                      />
                    </Td>
                  ) : null}

                  <Td className="max-w-[300px]">
                    <p className="flex items-center gap-1.5 font-medium">
                      {/* The workbook colour-coded each row's SR-NO cell by
                          score + index + on-page state; same signal, as a dot. */}
                      <span
                        aria-hidden
                        title={PAGE_HEALTH_LABELS[pageHealth(row)]}
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          HEALTH_DOT[pageHealth(row)],
                        )}
                      />
                      <span className="truncate" title={row.title}>
                        {row.title}
                      </span>
                      <span className="sr-only">
                        {PAGE_HEALTH_LABELS[pageHealth(row)]}
                      </span>
                    </p>
                    {row.targetUrl ? (
                      <a
                        href={row.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-faint hover:text-[var(--accent)] inline-flex items-center gap-1 truncate text-[11px] transition-colors"
                      >
                        {prettyUrl(row.targetUrl, 46)}
                        <ExternalLink className="size-2.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-faint text-[11px]">No URL set</span>
                    )}
                    {row.focusKeyword ? (
                      <p className="text-muted mt-0.5 truncate text-[11px]">
                        Focus: {row.focusKeyword}
                      </p>
                    ) : null}
                  </Td>

                  <Td>
                    <Badge tone={TYPE_TONES[row.type] ?? "neutral"}>{row.type}</Badge>
                  </Td>

                  <Td align="center">
                    <FlagCell
                      value={row.onPageDone}
                      field="onPageDone"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>

                  <Td align="center">
                    {row.seoScore ? (
                      <Badge
                        tone={
                          row.seoScore.startsWith("9") || row.seoScore.startsWith("8")
                            ? "success"
                            : row.seoScore.startsWith("7")
                              ? "info"
                              : "warning"
                        }
                      >
                        {row.seoScore}
                      </Badge>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>

                  <Td align="center">
                    <FlagCell
                      value={row.indexed}
                      field="indexed"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>

                  <Td align="right" numeric>
                    {row.wordCount ? (
                      <span
                        className={cn(
                          row.wordCount < 500 && "text-[var(--color-amber-600)]",
                        )}
                        title={row.wordCount < 500 ? "Thin content" : undefined}
                      >
                        {formatNumber(row.wordCount)}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>

                  <Td align="center">
                    <FlagCell
                      value={row.hasFaqs}
                      field="hasFaqs"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>
                  <Td align="center">
                    <FlagCell
                      value={row.hasBlogSection}
                      field="hasBlogSection"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>
                  <Td align="center">
                    <FlagCell
                      value={row.hasReviewSection}
                      field="hasReviewSection"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>
                  <Td align="center">
                    <FlagCell
                      value={row.hasCaseStudySection}
                      field="hasCaseStudySection"
                      id={row.id}
                      projectId={projectId}
                      canEdit={canEdit}
                    />
                  </Td>

                  <Td align="right">
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-strong tnum font-semibold">
                        {row.keywordCount}
                      </span>
                      {row.page1Count > 0 ? (
                        <span className="tnum text-[10.5px] font-medium text-[var(--color-mint-600)]">
                          {row.page1Count} on P1
                        </span>
                      ) : null}
                    </span>
                  </Td>

                  {canEdit ? (
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => setEditing(row)}
                          aria-label="Edit page"
                          className="text-faint hover:text-strong rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(row)}
                          aria-label="Delete page"
                          className="text-faint rounded-lg p-1.5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-rose-500)_12%,transparent)] hover:text-[var(--color-rose-600)]"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </Td>
                  ) : null}
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </TableShell>

      {canEdit ? (
        <>
          <PageForm
            open={creating}
            onClose={() => setCreating(false)}
            projectId={projectId}
            row={null}
          />
          <PageForm
            open={editing !== null}
            onClose={() => setEditing(null)}
            projectId={projectId}
            row={editing}
          />
          <DeletePage
            row={deleting}
            projectId={projectId}
            onClose={() => setDeleting(null)}
          />
        </>
      ) : null}
    </>
  );
}

/** Click-to-toggle boolean cell. */
function FlagCell({
  value,
  field,
  id,
  projectId,
  canEdit,
}: {
  value: boolean;
  field: string;
  id: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();

  const icon = value ? (
    <Check className="size-3.5 text-[var(--color-mint-600)]" />
  ) : (
    <Minus className="text-faint size-3.5" />
  );

  if (!canEdit) return <span className="inline-flex">{icon}</span>;

  return (
    <form
      action={(fd) => {
        startTransition(() => {
          void togglePageFlagAction(fd);
        });
      }}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="field" value={field} />
      <button
        type="submit"
        aria-label={`Toggle ${field}`}
        className="rounded-lg p-1 transition-colors hover:bg-[var(--surface-hover)]"
      >
        {icon}
      </button>
    </form>
  );
}

function DeletePage({
  row,
  projectId,
  onClose,
}: {
  row: PageRow | null;
  projectId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <ConfirmDialog
      open={row !== null}
      onClose={onClose}
      loading={pending}
      title="Delete this page?"
      description={
        row ? (
          <>
            <strong className="text-strong">{row.title}</strong> will be removed
            from the audit.{" "}
            {row.keywordCount > 0
              ? `${row.keywordCount} keyword${row.keywordCount === 1 ? "" : "s"} will become unmapped, but will not be deleted.`
              : ""}
          </>
        ) : null
      }
      confirmLabel="Delete page"
      onConfirm={() => {
        if (!row) return;
        const fd = new FormData();
        fd.set("id", row.id);
        fd.set("projectId", projectId);
        startTransition(async () => {
          await deletePageAction(fd);
          toast.success("Page deleted.");
          onClose();
        });
      }}
    />
  );
}

function BulkBar({
  projectId,
  ids,
  onDone,
}: {
  projectId: string;
  ids: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(bulkUpdatePagesAction, idle);
  const [operation, setOperation] = useState("mark-optimised");
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onDone();
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!ids.length) {
    return (
      <p className="text-faint text-[12.5px]">Select pages to apply a bulk action.</p>
    );
  }

  const control =
    "surface-sunken text-body h-8 rounded-xl px-2 text-[12.5px] shadow-[var(--inset-well)] focus:outline-none";

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        /*
         * Deleting one row asks first; deleting fifty did not. Same
         * consequence, so it gets the same question. The ref rather than
         * state, because the confirm handler re-submits immediately and a
         * state update would not have landed yet.
         */
        if (operation === "delete" && !confirmedRef.current) {
          event.preventDefault();
          setConfirmingBulkDelete(true);
        }
        confirmedRef.current = false;
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <span className="text-strong text-[12.5px] font-semibold">
        {ids.length} selected
      </span>

      <select
        name="operation"
        value={operation}
        onChange={(e) => setOperation(e.target.value)}
        aria-label="Bulk action"
        className={control}
      >
        <option value="mark-optimised">Mark on-page done</option>
        <option value="mark-pending">Mark on-page pending</option>
        <option value="mark-indexed">Mark indexed</option>
        <option value="set-type">Change page type…</option>
        <option value="set-score">Set SEO score…</option>
        <option value="delete">Delete</option>
      </select>

      {operation === "set-type" ? (
        <select name="type" required aria-label="Page type" className={control}>
          <option value="">Pick a type…</option>
          {PAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}

      {operation === "set-score" ? (
        <select name="seoScore" aria-label="SEO score" className={control}>
          <option value="">Clear score</option>
          {SEO_SCORE_BUCKETS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}

      <Button
        type="submit"
        size="sm"
        variant={operation === "delete" ? "danger" : "secondary"}
        loading={pending}
      >
        Apply
      </Button>

      <ConfirmDialog
        open={confirmingBulkDelete}
        onClose={() => setConfirmingBulkDelete(false)}
        title={`Delete ${ids.length} page${ids.length === 1 ? "" : "s"}?`}
        description="Keywords mapped to them are unmapped, not deleted. This cannot be undone."
        confirmLabel={`Delete ${ids.length} page${ids.length === 1 ? "" : "s"}`}
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmingBulkDelete(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
