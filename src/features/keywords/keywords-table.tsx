"use client";

import { ExternalLink, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
import { IntentBadge, SerpPageBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { KeywordRow } from "@/db/queries/keywords";
import { idle } from "@/lib/action-state";
import { KEYWORD_INTENTS } from "@/lib/constants";
import { cn, formatCurrency, formatNumber, prettyUrl } from "@/lib/utils";

import {
  bulkUpdateKeywordsAction,
  deleteKeywordAction,
  togglePriorityAction,
} from "./actions";
import { KeywordForm, type PageOption } from "./keyword-form";

export function KeywordsTable({
  projectId,
  rows,
  pageOptions,
  canEdit,
}: {
  projectId: string;
  rows: KeywordRow[];
  pageOptions: PageOption[];
  canEdit: boolean;
}) {
  const [selectedRaw, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<KeywordRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<KeywordRow | null>(null);
  const [, startTransition] = useTransition();

  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  // Selections for rows that are no longer on this page are ignored rather
  // than pruned in an effect: derived during render, so there is no second
  // render pass and no moment where a bulk action could act on a stale id.
  const selected = useMemo(
    () => new Set([...selectedRaw].filter((id) => visibleIds.has(id))),
    [selectedRaw, visibleIds],
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const columnCount = canEdit ? 12 : 10;

  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <BulkBar
            projectId={projectId}
            ids={[...selected]}
            pageOptions={pageOptions}
            onDone={() => setSelected(new Set())}
          />
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add keyword
          </Button>
        </div>
      ) : null}

      <TableShell>
        <Table minWidth={canEdit ? 1280 : 1060}>
          <Thead>
            {canEdit ? (
              <Th width={38}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                  aria-label="Select all keywords on this page"
                  className="size-3.5 cursor-pointer accent-[var(--accent)]"
                />
              </Th>
            ) : null}
            <Th width={44} align="center" title="Priority keyword">
              ★
            </Th>
            <Th>
              <SortHeader column="keyword" defaultDir="asc">
                Keyword
              </SortHeader>
            </Th>
            <Th width={120}>
              <SortHeader column="intent" defaultDir="asc">
                Intent
              </SortHeader>
            </Th>
            <Th width={86} align="right">
              <SortHeader column="volume" align="right">
                Volume
              </SortHeader>
            </Th>
            <Th width={62} align="right">
              <SortHeader column="kd" align="right">
                KD
              </SortHeader>
            </Th>
            <Th width={76} align="right">
              <SortHeader column="cpc" align="right">
                CPC
              </SortHeader>
            </Th>
            <Th>
              <SortHeader column="pageTitle" defaultDir="asc">
                Target page
              </SortHeader>
            </Th>
            <Th width={150}>Links vs target</Th>
            <Th width={90} align="center">
              Rank
            </Th>
            <Th width={70} align="center">
              Page
            </Th>
            {canEdit ? <Th width={78} align="right" /> : null}
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <TrEmpty colSpan={columnCount}>
                <EmptyState
                  title="No keywords match these filters"
                  description="Clear the filters, or add the keywords this project targets."
                  action={
                    canEdit ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="size-4" />
                        Add keyword
                      </Button>
                    ) : undefined
                  }
                />
              </TrEmpty>
            ) : (
              rows.map((row) => {
                const delta =
                  row.currentPosition != null && row.previousPosition != null
                    ? row.previousPosition - row.currentPosition
                    : null;
                return (
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
                          aria-label={`Select ${row.keyword}`}
                          className="size-3.5 cursor-pointer accent-[var(--accent)]"
                        />
                      </Td>
                    ) : null}

                    <Td align="center">
                      {canEdit ? (
                        <form
                          action={(fd) => {
                            startTransition(() => {
                              void togglePriorityAction(fd);
                            });
                          }}
                          className="inline-flex"
                        >
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="projectId" value={projectId} />
                          <button
                            type="submit"
                            aria-label={
                              row.priority ? "Remove priority" : "Mark as priority"
                            }
                            className="rounded p-0.5 transition-colors hover:bg-[var(--surface-hover)]"
                          >
                            <Star
                              className={cn(
                                "size-3.5",
                                row.priority
                                  ? "fill-[var(--color-amber-500)] text-[var(--color-amber-500)]"
                                  : "text-faint",
                              )}
                            />
                          </button>
                        </form>
                      ) : row.priority ? (
                        <Star className="mx-auto size-3.5 fill-[var(--color-amber-500)] text-[var(--color-amber-500)]" />
                      ) : null}
                    </Td>

                    <Td className="max-w-[280px]">
                      <p className="truncate font-medium" title={row.keyword}>
                        {row.keyword}
                      </p>
                    </Td>

                    <Td>
                      <IntentBadge intent={row.intent} />
                    </Td>

                    <Td align="right" numeric>
                      {formatNumber(row.volume)}
                    </Td>

                    <Td align="right" numeric>
                      {row.kd != null ? row.kd.toFixed(0) : "—"}
                    </Td>

                    <Td align="right" numeric>
                      {row.cpc ? formatCurrency(row.cpc) : "—"}
                    </Td>

                    <Td className="max-w-[220px]">
                      {row.pageTitle ? (
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px]" title={row.pageTitle}>
                            {row.pageTitle}
                          </p>
                          {row.targetUrl ? (
                            <a
                              href={row.targetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-faint hover:text-[var(--accent)] inline-flex items-center gap-1 truncate text-[11px] transition-colors"
                            >
                              {prettyUrl(row.targetUrl, 30)}
                              <ExternalLink className="size-2.5 shrink-0" />
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-faint text-[12px]">Not mapped</span>
                      )}
                    </Td>

                    <Td>
                      {row.backlinkTarget > 0 ? (
                        <div>
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <span className="text-muted tnum text-[11.5px]">
                              {row.linksPublished}/{row.backlinkTarget}
                            </span>
                            {row.linksThisMonth > 0 ? (
                              <span className="tnum text-[10.5px] font-medium text-[var(--color-mint-600)]">
                                +{row.linksThisMonth} this month
                              </span>
                            ) : null}
                          </div>
                          <ProgressBar
                            value={row.progress}
                            height="sm"
                            tone={row.progress >= 100 ? "success" : "brand"}
                          />
                        </div>
                      ) : (
                        <span className="text-faint tnum text-[12px]">
                          {row.linksPublished} link{row.linksPublished === 1 ? "" : "s"}
                          <span className="ml-1 opacity-60">· no target</span>
                        </span>
                      )}
                    </Td>

                    <Td align="center">
                      {row.currentPosition != null ? (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-strong tnum font-semibold">
                            #{row.currentPosition.toFixed(0)}
                          </span>
                          {delta !== null && Math.abs(delta) >= 0.5 ? (
                            <span
                              className={cn(
                                "tnum text-[10.5px] font-medium",
                                delta > 0
                                  ? "text-[var(--color-mint-600)]"
                                  : "text-[var(--color-rose-600)]",
                              )}
                            >
                              {delta > 0 ? "▲" : "▼"}
                              {Math.abs(delta).toFixed(0)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>

                    <Td align="center">
                      <SerpPageBadge page={row.currentPage} />
                    </Td>

                    {canEdit ? (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => setEditing(row)}
                            aria-label="Edit keyword"
                            className="text-faint hover:text-strong rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleting(row)}
                            aria-label="Delete keyword"
                            className="text-faint rounded-lg p-1.5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-rose-500)_12%,transparent)] hover:text-[var(--color-rose-600)]"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </Td>
                    ) : null}
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
      </TableShell>

      {canEdit ? (
        <>
          <KeywordForm
            open={creating}
            onClose={() => setCreating(false)}
            projectId={projectId}
            row={null}
            pageOptions={pageOptions}
          />
          <KeywordForm
            open={editing !== null}
            onClose={() => setEditing(null)}
            projectId={projectId}
            row={editing}
            pageOptions={pageOptions}
          />
          <DeleteKeyword
            row={deleting}
            projectId={projectId}
            onClose={() => setDeleting(null)}
          />
        </>
      ) : null}
    </>
  );
}

function DeleteKeyword({
  row,
  projectId,
  onClose,
}: {
  row: KeywordRow | null;
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
      title="Delete this keyword?"
      description={
        row ? (
          <>
            <strong className="text-strong">{row.keyword}</strong> and its full
            rank history will be removed. Backlinks using it as anchor text are
            kept.
          </>
        ) : null
      }
      confirmLabel="Delete keyword"
      onConfirm={() => {
        if (!row) return;
        const fd = new FormData();
        fd.set("id", row.id);
        fd.set("projectId", projectId);
        startTransition(async () => {
          await deleteKeywordAction(fd);
          toast.success("Keyword deleted.");
          onClose();
        });
      }}
    />
  );
}

function BulkBar({
  projectId,
  ids,
  pageOptions,
  onDone,
}: {
  projectId: string;
  ids: string[];
  pageOptions: PageOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(bulkUpdateKeywordsAction, idle);
  const [operation, setOperation] = useState("prioritise");
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
      <p className="text-faint text-[12.5px]">
        Select keywords to apply a bulk action.
      </p>
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
        <option value="prioritise">Mark priority</option>
        <option value="deprioritise">Remove priority</option>
        <option value="set-intent">Set intent…</option>
        <option value="set-page">Map to page…</option>
        <option value="set-target">Set backlink target…</option>
        <option value="delete">Delete</option>
      </select>

      {operation === "set-intent" ? (
        <select name="intent" required aria-label="Intent" className={control}>
          <option value="">Pick intent…</option>
          {KEYWORD_INTENTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      ) : null}

      {operation === "set-page" ? (
        <select name="pageId" aria-label="Target page" className={control}>
          <option value="">Unmap</option>
          {pageOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      ) : null}

      {operation === "set-target" ? (
        <input
          name="backlinkTarget"
          type="number"
          min={0}
          required
          placeholder="10"
          aria-label="Backlink target"
          className={`${control} w-20`}
        />
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
        title={`Delete ${ids.length} keyword${ids.length === 1 ? "" : "s"}?`}
        description="Their rank history goes with them. This cannot be undone."
        confirmLabel={`Delete ${ids.length} keyword${ids.length === 1 ? "" : "s"}`}
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmingBulkDelete(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
