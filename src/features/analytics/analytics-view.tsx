"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { CtrTrendChart, SearchTrendChart } from "@/components/charts/dashboard-charts";
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
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { AnalyticsRow } from "@/db/queries/analytics";
import { idle } from "@/lib/action-state";
import { COUNTRIES } from "@/lib/constants";
import {
  cn,
  compactNumber,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/lib/utils";

import { deleteAnalyticsAction, saveAnalyticsAction } from "./actions";

export function AnalyticsView({
  projectId,
  rows,
  canEdit,
  suggestedMonth,
  today,
  defaultCountry,
}: {
  projectId: string;
  rows: AnalyticsRow[];
  canEdit: boolean;
  /** The month after the newest one on file — what you are almost always adding. */
  suggestedMonth?: string;
  today?: string;
  defaultCountry?: string;
}) {
  const [editing, setEditing] = useState<AnalyticsRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AnalyticsRow | null>(null);

  // Charts read oldest → newest; the table reads newest first.
  const chartData = rows.map((r) => ({
    label: r.label,
    clicks: r.clicks,
    impressions: r.impressions,
    traffic: r.gaTraffic ?? 0,
    ctr: r.ctr,
  }));
  const tableRows = [...rows].reverse();

  return (
    <>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Clicks, impressions & sessions"
            description="Impressions on the left axis; clicks and GA sessions on the right."
          />
          <CardBody>
            {chartData.length ? (
              <SearchTrendChart data={chartData} />
            ) : (
              <p className="text-faint py-10 text-center text-[12.5px]">
                No months recorded yet.
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Click-through rate" description="Clicks ÷ impressions." />
          <CardBody>
            {chartData.length ? (
              <CtrTrendChart data={chartData} />
            ) : (
              <p className="text-faint py-10 text-center text-[12.5px]">No data yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {canEdit ? (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add month
          </Button>
        </div>
      ) : null}

      <TableShell>
        <Table minWidth={canEdit ? 1080 : 960}>
          <Thead>
            <Th width={110}>Month</Th>
            <Th width={110}>Captured</Th>
            <Th width={120}>Country</Th>
            <Th width={92} align="right">
              Clicks
            </Th>
            <Th width={110} align="right">
              Impressions
            </Th>
            <Th width={86} align="right">
              CTR
            </Th>
            <Th width={110} align="right">
              Impr. growth
            </Th>
            <Th width={100} align="right">
              GA sessions
            </Th>
            <Th width={100} align="right">
              Keywords
            </Th>
            {canEdit ? <Th width={78} align="right" /> : null}
          </Thead>
          <Tbody>
            {tableRows.length === 0 ? (
              <TrEmpty colSpan={canEdit ? 10 : 9}>
                <EmptyState
                  title="No Search Console data yet"
                  description="Add a month manually, or paste your existing monthly export on the Import tab."
                  action={
                    canEdit ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="size-4" />
                        Add the first month
                      </Button>
                    ) : undefined
                  }
                />
              </TrEmpty>
            ) : (
              tableRows.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-medium">{row.label}</Td>
                  <Td className="text-[12.5px]">{formatDate(row.capturedOn)}</Td>
                  <Td className="text-[12.5px]">{row.country}</Td>
                  <Td align="right" numeric>
                    {formatNumber(row.clicks)}
                  </Td>
                  <Td align="right" numeric>
                    {formatNumber(row.impressions)}
                  </Td>
                  <Td align="right" numeric>
                    {formatPercent(row.ctr, 2)}
                  </Td>
                  <Td align="right" numeric>
                    {row.impressionGrowth === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium",
                          row.impressionGrowth > 0
                            ? "text-[var(--color-mint-600)]"
                            : row.impressionGrowth < 0
                              ? "text-[var(--color-rose-600)]"
                              : "text-muted",
                        )}
                      >
                        {row.impressionGrowth > 0 ? "+" : ""}
                        {row.impressionGrowth.toFixed(1)}%
                      </span>
                    )}
                  </Td>
                  <Td align="right" numeric>
                    {row.gaTraffic != null ? formatNumber(row.gaTraffic) : "—"}
                  </Td>
                  <Td align="right" numeric>
                    {row.keywordCountLabel ??
                      (row.keywordCount != null
                        ? compactNumber(row.keywordCount)
                        : "—")}
                  </Td>
                  {canEdit ? (
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => setEditing(row)}
                          aria-label={`Edit ${row.label}`}
                          className="text-faint hover:text-strong rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(row)}
                          aria-label={`Delete ${row.label}`}
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
          <AnalyticsForm
            open={creating}
            onClose={() => setCreating(false)}
            projectId={projectId}
            row={null}
            suggestedMonth={suggestedMonth}
            today={today}
            defaultCountry={defaultCountry}
          />
          <AnalyticsForm
            open={editing !== null}
            onClose={() => setEditing(null)}
            projectId={projectId}
            row={editing}
            suggestedMonth={suggestedMonth}
            today={today}
            defaultCountry={defaultCountry}
          />
          <DeleteMonth
            row={deleting}
            projectId={projectId}
            onClose={() => setDeleting(null)}
          />
        </>
      ) : null}
    </>
  );
}

function AnalyticsForm({
  open,
  onClose,
  projectId,
  row,
  suggestedMonth,
  today,
  defaultCountry,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  row: AnalyticsRow | null;
  suggestedMonth?: string;
  today?: string;
  defaultCountry?: string;
}) {
  const [state, action, pending] = useActionState(saveAnalyticsAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    } else if (!state.ok && state.message && !state.errors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={row ? `Edit ${row.label}` : "Add a month"}
      description="CTR and growth rates are calculated for you — enter the raw numbers only."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="analytics-form" variant="primary" loading={pending}>
            {row ? "Save changes" : "Add month"}
          </Button>
        </>
      }
    >
      <form id="analytics-form" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="projectId" value={projectId} />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Month"
            name="month"
            type="month"
            required
            defaultValue={row?.month.slice(0, 7) ?? suggestedMonth ?? ""}
            error={state.errors?.month}
            data-autofocus
          />
          <Input
            label="Date captured"
            name="capturedOn"
            type="date"
            help="When you pulled the report."
            defaultValue={row?.capturedOn ?? today ?? ""}
          />
        </div>

        <Select
          label="Country"
          name="country"
          required
          defaultValue={row?.country ?? defaultCountry ?? "Canada"}
          options={COUNTRIES.map((c) => ({ value: c, label: c }))}
          error={state.errors?.country}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Clicks"
            name="clicks"
            type="number"
            min={0}
            step="1"
            required
            placeholder="29"
            defaultValue={row?.clicks ?? ""}
            error={state.errors?.clicks}
          />
          <Input
            label="Impressions"
            name="impressions"
            type="number"
            min={0}
            step="1"
            required
            placeholder="70522"
            defaultValue={row?.impressions ?? ""}
            error={state.errors?.impressions}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="GA organic sessions"
            name="gaTraffic"
            type="number"
            min={0}
            step="1"
            placeholder="23"
            defaultValue={row?.gaTraffic ?? ""}
          />
          <Input
            label="Average position"
            name="avgPosition"
            type="number"
            min={0}
            step="0.1"
            placeholder="18.4"
            defaultValue={row?.avgPosition ?? ""}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Keyword count"
            name="keywordCount"
            type="number"
            min={0}
            step="1"
            placeholder="1405"
            defaultValue={row?.keywordCount ?? ""}
          />
          <Input
            label="Keyword label"
            name="keywordCountLabel"
            placeholder="1000+"
            help="Use when GSC caps the number."
            defaultValue={row?.keywordCountLabel ?? ""}
          />
        </div>

        <Textarea
          label="Notes"
          name="notes"
          rows={2}
          placeholder="Algorithm update, tracking change, seasonality…"
          defaultValue={row?.notes ?? ""}
        />
      </form>
    </Dialog>
  );
}

function DeleteMonth({
  row,
  projectId,
  onClose,
}: {
  row: AnalyticsRow | null;
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
      title="Delete this month?"
      description={
        row
          ? `${row.label} (${row.country}) will be removed. Growth rates for the following month will recalculate.`
          : null
      }
      confirmLabel="Delete month"
      onConfirm={() => {
        if (!row) return;
        const fd = new FormData();
        fd.set("id", row.id);
        fd.set("projectId", projectId);
        startTransition(async () => {
          await deleteAnalyticsAction(fd);
          toast.success("Month deleted.");
          onClose();
        });
      }}
    />
  );
}
