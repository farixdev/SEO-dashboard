"use client";

import { Save, Star } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

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
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { cn, formatNumber, monthLabelLong, positionToPage } from "@/lib/utils";

import { saveMonthRankingsAction } from "./actions";

export type EntryRow = {
  keywordId: string;
  keyword: string;
  volume: number | null;
  priority: boolean;
  pageTitle: string | null;
  position: number | null;
  page: number | null;
  checkedOn: string | null;
  previous: number | null;
};

/**
 * Bulk position entry for one month. Everything posts in a single submit, so a
 * 779-keyword project is one round-trip rather than 779.
 */
export function MonthEntryGrid({
  projectId,
  month,
  checkedOn,
  rows,
}: {
  projectId: string;
  month: string;
  checkedOn: string | null;
  rows: EntryRow[];
}) {
  const [state, action, pending] = useActionState(saveMonthRankingsAction, idle);
  const toast = useToast();

  // Local values so the derived "page" column updates as you type.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.keywordId, r.position != null ? String(r.position) : ""]),
    ),
  );
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const visible = filter
    ? rows.filter(
        (r) =>
          r.keyword.toLowerCase().includes(filter.toLowerCase()) ||
          r.pageTitle?.toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  const visibleIds = new Set(visible.map((r) => r.keywordId));

  const filled = Object.values(values).filter((v) => v.trim() !== "").length;

  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="month" value={month} />

      <div className="panel mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-muted mb-1.5 text-[12.5px] font-medium">
              Entering positions for
            </p>
            <p className="text-strong text-[15px] font-semibold">
              {monthLabelLong(month)}
            </p>
          </div>
          <label className="block">
            <span className="text-muted mb-1.5 block text-[12.5px] font-medium">
              Date checked
            </span>
            <input
              type="date"
              name="checkedOn"
              defaultValue={checkedOn ?? ""}
              className="surface-sunken text-strong h-9 rounded-xl px-3 text-[13px] shadow-[var(--inset-well)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1.5 block text-[12.5px] font-medium">
              Filter rows
            </span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type to narrow…"
              className="surface-sunken text-strong h-9 w-52 rounded-xl px-3 text-[13px] shadow-[var(--inset-well)] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-faint tnum text-[12.5px]">
            {filled} of {rows.length} filled
          </span>
          <Button type="submit" variant="primary" loading={pending}>
            <Save className="size-4" />
            Save month
          </Button>
        </div>
      </div>

      <p className="text-faint mb-3 text-[12px]">
        Enter the absolute Google position (1–100). Leave a field blank to record
        “not ranking” — that clears any existing value for the month. The SERP
        page is derived automatically.
      </p>

      <TableShell>
        <Table minWidth={860}>
          <Thead>
            <Th width={36} align="center" title="Priority">
              ★
            </Th>
            <Th>Keyword</Th>
            <Th width={200}>Target page</Th>
            <Th width={86} align="right">
              Volume
            </Th>
            <Th width={92} align="right">
              Previous
            </Th>
            <Th width={110} align="center">
              Position
            </Th>
            <Th width={80} align="center">
              Page
            </Th>
            <Th width={80} align="center">
              Change
            </Th>
          </Thead>
          <Tbody>
            {visible.length === 0 ? (
              <TrEmpty colSpan={8}>
                <EmptyState
                  title={rows.length === 0 ? "No keywords yet" : "No rows match that filter"}
                  description={
                    rows.length === 0
                      ? "Add keywords to this project before recording positions."
                      : "Try a different search term."
                  }
                />
              </TrEmpty>
            ) : (
              visible.map((row) => {
                const raw = values[row.keywordId] ?? "";
                const numeric = raw.trim() === "" ? null : Number(raw);
                const valid = numeric !== null && Number.isFinite(numeric) && numeric > 0;
                const derivedPage = valid ? positionToPage(numeric) : null;
                const delta =
                  valid && row.previous != null ? row.previous - numeric! : null;

                return (
                  <Tr key={row.keywordId}>
                    <Td align="center">
                      {row.priority ? (
                        <Star className="mx-auto size-3 fill-[var(--color-amber-500)] text-[var(--color-amber-500)]" />
                      ) : null}
                    </Td>

                    <Td className="max-w-[280px]">
                      <p className="truncate font-medium" title={row.keyword}>
                        {row.keyword}
                      </p>
                    </Td>

                    <Td className="max-w-[200px]">
                      {row.pageTitle ? (
                        <span className="text-muted truncate text-[12px]">
                          {row.pageTitle}
                        </span>
                      ) : (
                        <span className="text-faint text-[12px]">Not mapped</span>
                      )}
                    </Td>

                    <Td align="right" numeric>
                      {formatNumber(row.volume)}
                    </Td>

                    <Td align="right" numeric>
                      {row.previous != null ? (
                        <span className="text-muted">#{row.previous.toFixed(0)}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>

                    <Td align="center">
                      <input
                        name={`position-${row.keywordId}`}
                        type="number"
                        min={1}
                        max={200}
                        step="0.1"
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [row.keywordId]: e.target.value,
                          }))
                        }
                        placeholder="—"
                        aria-label={`Position for ${row.keyword}`}
                        className={cn(
                          "surface-sunken tnum h-8 w-20 rounded-lg px-2 text-center text-[13px]",
                          "shadow-[var(--inset-well)] focus:outline-none",
                          "focus:ring-2 focus:ring-[var(--accent-ring)]",
                          valid && numeric! <= 10 && "text-[var(--color-mint-600)] font-semibold",
                        )}
                      />
                    </Td>

                    <Td align="center">
                      {derivedPage ? (
                        <span className="text-muted tnum text-[12.5px]">
                          P{derivedPage}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>

                    <Td align="center">
                      {delta === null || Math.abs(delta) < 0.5 ? (
                        <span className="text-faint text-[11.5px]">–</span>
                      ) : (
                        <span
                          className={cn(
                            "tnum text-[12px] font-semibold",
                            delta > 0
                              ? "text-[var(--color-mint-600)]"
                              : "text-[var(--color-rose-600)]",
                          )}
                        >
                          {delta > 0 ? "▲" : "▼"}
                          {Math.abs(delta).toFixed(0)}
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
      </TableShell>

      {/*
        Rows hidden by the filter still have to reach the server. Only visible
        rows render an <input>, so without these a position typed before
        searching for the next keyword was dropped on save — silently, because
        the action simply never sees a field it was not sent.
      */}
      {rows
        .filter((row) => !visibleIds.has(row.keywordId))
        .map((row) => (
          <input
            key={row.keywordId}
            type="hidden"
            name={`position-${row.keywordId}`}
            value={values[row.keywordId] ?? ""}
          />
        ))}

      <div className="mt-4 flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          <Save className="size-4" />
          Save {monthLabelLong(month)}
        </Button>
      </div>
    </form>
  );
}
