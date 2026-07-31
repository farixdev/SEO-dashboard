"use client";

import {
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  XCircle,
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
import { Badge, SpamBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton, SecretField } from "@/components/ui/copy";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { BacklinkRow } from "@/db/queries/backlinks";
import { idle } from "@/lib/action-state";
import { BACKLINK_TYPES } from "@/lib/constants";
import { cn, formatDate, prettyUrl } from "@/lib/utils";

import {
  bulkUpdateBacklinksAction,
  deleteBacklinkAction,
  toggleBacklinkIndexedAction,
} from "./actions";
import { type AssigneeOption, BacklinkForm } from "./backlink-form";

export function BacklinksTable({
  projectId,
  rows,
  assignees,
  canEdit,
}: {
  projectId: string;
  rows: BacklinkRow[];
  assignees: AssigneeOption[];
  canEdit: boolean;
}) {
  const [selectedRaw, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<BacklinkRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BacklinkRow | null>(null);
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

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columnCount = canEdit ? 11 : 8;

  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <BulkBar
            projectId={projectId}
            ids={[...selected]}
            assignees={assignees}
            onDone={() => setSelected(new Set())}
          />
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add backlink
          </Button>
        </div>
      ) : null}

      <TableShell>
        <Table minWidth={canEdit ? 1220 : 900}>
          <Thead>
            {canEdit ? (
              <Th width={38}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                  className="size-3.5 cursor-pointer accent-[var(--accent)]"
                />
              </Th>
            ) : null}
            <Th>
              <SortHeader column="url">Link</SortHeader>
            </Th>
            <Th width={150}>
              <SortHeader column="type">Type</SortHeader>
            </Th>
            <Th width={110}>
              <SortHeader column="status">Status</SortHeader>
            </Th>
            <Th width={90} align="center">
              <SortHeader column="indexed" align="center">
                Index
              </SortHeader>
            </Th>
            <Th>Anchor text</Th>
            <Th width={110}>
              <SortHeader column="publishedDate">Published</SortHeader>
            </Th>
            <Th width={66} align="right">
              <SortHeader column="da" align="right">
                DA
              </SortHeader>
            </Th>
            <Th width={80} align="right">
              <SortHeader column="spamScore" align="right">
                Spam
              </SortHeader>
            </Th>
            {canEdit ? <Th width={130}>Built by</Th> : null}
            {canEdit ? <Th width={150}>Login</Th> : null}
            {canEdit ? <Th width={78} align="right" /> : null}
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <TrEmpty colSpan={columnCount}>
                <EmptyState
                  title="No backlinks match these filters"
                  description="Clear the filters, or log the first link for this project."
                  action={
                    canEdit ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="size-4" />
                        Add backlink
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
                        onChange={() => toggleOne(row.id)}
                        aria-label={`Select ${row.url}`}
                        className="size-3.5 cursor-pointer accent-[var(--accent)]"
                      />
                    </Td>
                  ) : null}

                  <Td className="max-w-[320px]">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-body hover:text-[var(--accent)] min-w-0 truncate transition-colors"
                        title={row.url}
                      >
                        {prettyUrl(row.url, 52)}
                      </a>
                      <ExternalLink className="text-faint size-3 shrink-0" />
                      <CopyButton value={row.url} label="Copy link URL" />
                    </div>
                  </Td>

                  <Td>
                    <Badge tone="neutral">{row.type}</Badge>
                  </Td>

                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>

                  <Td align="center">
                    {canEdit ? (
                      <form
                        action={(fd) => {
                          startTransition(() => {
                            void toggleBacklinkIndexedAction(fd);
                          });
                        }}
                        className="inline-flex"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="projectId" value={projectId} />
                        <button
                          type="submit"
                          title={row.indexed ? "Indexed — click to unset" : "Not indexed — click to set"}
                          className={cn(
                            "rounded-lg p-1 transition-colors hover:bg-[var(--surface-hover)]",
                            row.indexed
                              ? "text-[var(--color-mint-600)]"
                              : "text-faint",
                          )}
                        >
                          {row.indexed ? (
                            <CheckCircle2 className="size-4" />
                          ) : (
                            <XCircle className="size-4" />
                          )}
                        </button>
                      </form>
                    ) : row.indexed ? (
                      <CheckCircle2 className="mx-auto size-4 text-[var(--color-mint-600)]" />
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>

                  <Td className="max-w-[240px]">
                    {row.anchorText1 || row.anchorText2 ? (
                      <div className="space-y-0.5">
                        {row.anchorText1 ? (
                          <p className="truncate text-[12.5px]" title={row.anchorText1}>
                            {row.anchorText1}
                          </p>
                        ) : null}
                        {row.anchorText2 ? (
                          <p
                            className="text-faint truncate text-[11.5px]"
                            title={row.anchorText2}
                          >
                            {row.anchorText2}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-faint text-[12px]">No anchor</span>
                    )}
                  </Td>

                  <Td numeric className="text-[12.5px] whitespace-nowrap">
                    {formatDate(row.publishedDate)}
                  </Td>

                  <Td align="right" numeric>
                    {row.da ?? "—"}
                  </Td>

                  <Td align="right">
                    <SpamBadge score={row.spamScore} />
                  </Td>

                  {canEdit ? (
                    <Td>
                      {row.assigneeName ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={row.assigneeName} size="xs" />
                          <span className="truncate text-[12.5px]">
                            {row.assigneeName}
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint text-[12px]">Unassigned</span>
                      )}
                    </Td>
                  ) : null}

                  {canEdit ? (
                    <Td>
                      {row.loginUser || row.loginPassword ? (
                        <div className="space-y-1">
                          {row.loginUser ? (
                            <div className="flex items-center gap-1">
                              <code className="surface-sunken max-w-[13ch] truncate rounded px-1 font-mono text-[11px]">
                                {row.loginUser}
                              </code>
                              <CopyButton value={row.loginUser} label="Copy username" />
                            </div>
                          ) : null}
                          <SecretField value={row.loginPassword} label="password" />
                        </div>
                      ) : (
                        <span className="text-faint text-[12px]">—</span>
                      )}
                    </Td>
                  ) : null}

                  {canEdit ? (
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => setEditing(row)}
                          aria-label="Edit backlink"
                          className="text-faint hover:text-strong rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(row)}
                          aria-label="Delete backlink"
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
          <BacklinkForm
            open={creating}
            onClose={() => setCreating(false)}
            projectId={projectId}
            row={null}
            assignees={assignees}
          />
          <BacklinkForm
            open={editing !== null}
            onClose={() => setEditing(null)}
            projectId={projectId}
            row={editing}
            assignees={assignees}
          />
          <DeleteBacklink
            row={deleting}
            projectId={projectId}
            onClose={() => setDeleting(null)}
          />
        </>
      ) : null}
    </>
  );
}

/* ── Delete confirmation ───────────────────────────────────────── */

function DeleteBacklink({
  row,
  projectId,
  onClose,
}: {
  row: BacklinkRow | null;
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
      title="Delete this backlink?"
      description={
        row ? (
          <>
            <span className="break-all">{prettyUrl(row.url, 80)}</span> will be
            removed permanently. Keyword totals that counted this link will drop
            accordingly.
          </>
        ) : null
      }
      confirmLabel="Delete link"
      onConfirm={() => {
        if (!row) return;
        const fd = new FormData();
        fd.set("id", row.id);
        fd.set("projectId", projectId);
        startTransition(async () => {
          await deleteBacklinkAction(fd);
          toast.success("Backlink deleted.");
          onClose();
        });
      }}
    />
  );
}

/* ── Bulk actions ──────────────────────────────────────────────── */

function BulkBar({
  projectId,
  ids,
  assignees,
  onDone,
}: {
  projectId: string;
  ids: string[];
  assignees: AssigneeOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(bulkUpdateBacklinksAction, idle);
  const [operation, setOperation] = useState("mark-indexed");
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [extra, setExtra] = useState("");
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
        Select rows to apply a bulk action.
      </p>
    );
  }

  const needsType = operation === "set-type";
  const needsAssignee = operation === "set-assignee";

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
        className="surface-sunken text-body h-8 rounded-xl px-2 text-[12.5px] shadow-[var(--inset-well)] focus:outline-none"
      >
        <option value="mark-indexed">Mark indexed</option>
        <option value="mark-not-indexed">Mark not indexed</option>
        <option value="mark-published">Mark published</option>
        <option value="mark-pending">Mark pending</option>
        <option value="set-type">Change link type…</option>
        <option value="set-assignee">Reassign…</option>
        <option value="delete">Delete</option>
      </select>

      {needsType ? (
        <select
          name="type"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          required
          aria-label="New link type"
          className="surface-sunken text-body h-8 rounded-xl px-2 text-[12.5px] shadow-[var(--inset-well)] focus:outline-none"
        >
          <option value="">Pick a type…</option>
          {BACKLINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}

      {needsAssignee ? (
        <select
          name="assigneeId"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          aria-label="New assignee"
          className="surface-sunken text-body h-8 rounded-xl px-2 text-[12.5px] shadow-[var(--inset-well)] focus:outline-none"
        >
          <option value="">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
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
        title={`Delete ${ids.length} backlink${ids.length === 1 ? "" : "s"}?`}
        description="This also removes them from every total the client sees. This cannot be undone."
        confirmLabel={`Delete ${ids.length} backlink${ids.length === 1 ? "" : "s"}`}
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmingBulkDelete(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
