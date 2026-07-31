import { Star } from "lucide-react";

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
import { EmptyState } from "@/components/ui/misc";
import type { RankMatrixRow } from "@/db/queries/rankings";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Heat colour by SERP position. Deliberately uses opacity over a single hue per
 * band rather than a rainbow — the eye should read "how close to page 1", not
 * eight unrelated colours.
 */
function cellTone(position: number | null | undefined) {
  if (position == null) return "text-faint";
  if (position <= 3)
    return "bg-[color-mix(in_oklab,var(--color-mint-500)_28%,transparent)] text-[var(--color-mint-700)] dark:text-[var(--color-mint-500)] font-semibold";
  if (position <= 10)
    return "bg-[color-mix(in_oklab,var(--color-mint-500)_14%,transparent)] text-[var(--color-mint-700)] dark:text-[var(--color-mint-500)]";
  if (position <= 20)
    return "bg-[color-mix(in_oklab,var(--color-sky-500)_14%,transparent)] text-[var(--color-sky-700)] dark:text-[var(--color-sky-500)]";
  if (position <= 50)
    return "bg-[color-mix(in_oklab,var(--color-amber-500)_14%,transparent)] text-[var(--color-amber-700)] dark:text-[var(--color-amber-500)]";
  return "bg-[color-mix(in_oklab,var(--color-rose-500)_10%,transparent)] text-[var(--color-rose-700)] dark:text-[var(--color-rose-500)]";
}

export function RankMatrix({
  months,
  monthLabels,
  rows,
}: {
  months: string[];
  monthLabels: { month: string; label: string }[];
  rows: RankMatrixRow[];
}) {
  return (
    <>
      <TableShell>
        <Table minWidth={420 + months.length * 62}>
          <Thead>
            <Th width={36} align="center" title="Priority">
              ★
            </Th>
            <Th className="sticky left-0 z-10">Keyword</Th>
            <Th width={78} align="right">
              Volume
            </Th>
            <Th width={62} align="right" title="Best position ever recorded">
              Best
            </Th>
            {monthLabels.map((m) => (
              <Th key={m.month} width={62} align="center">
                {m.label}
              </Th>
            ))}
            <Th width={66} align="center" title="Change vs the previous month">
              Δ
            </Th>
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <TrEmpty colSpan={5 + months.length}>
                <EmptyState
                  title="No rank data yet"
                  description="Enter positions for a month to start building the history. Each month becomes a column here."
                />
              </TrEmpty>
            ) : (
              rows.map((row) => (
                <Tr key={row.keywordId}>
                  <Td align="center">
                    {row.priority ? (
                      <Star className="mx-auto size-3 fill-[var(--color-amber-500)] text-[var(--color-amber-500)]" />
                    ) : null}
                  </Td>

                  <Td className="surface-raised sticky left-0 z-10 max-w-[260px]">
                    <p className="truncate font-medium" title={row.keyword}>
                      {row.keyword}
                    </p>
                    {row.pageTitle ? (
                      <p className="text-faint truncate text-[11px]">{row.pageTitle}</p>
                    ) : null}
                  </Td>

                  <Td align="right" numeric>
                    {formatNumber(row.volume)}
                  </Td>

                  <Td align="right" numeric>
                    {row.best != null ? (
                      <span className="text-[var(--color-mint-600)] font-medium">
                        #{row.best.toFixed(0)}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>

                  {months.map((month) => {
                    const cell = row.cells[month];
                    return (
                      <td
                        key={month}
                        className={cn(
                          "tnum border-b px-1 py-2 text-center text-[12.5px]",
                          cellTone(cell?.position),
                        )}
                        style={{ borderColor: "var(--line-soft)" }}
                        title={
                          cell?.position != null
                            ? `Position ${cell.position} · page ${cell.page ?? "?"}`
                            : "Not ranking"
                        }
                      >
                        {cell?.position != null ? cell.position.toFixed(0) : "·"}
                      </td>
                    );
                  })}

                  <Td align="center">
                    {row.delta === null ? (
                      <span className="text-faint">—</span>
                    ) : Math.abs(row.delta) < 0.5 ? (
                      <span className="text-faint text-[11.5px]">–</span>
                    ) : (
                      <span
                        className={cn(
                          "tnum text-[12px] font-semibold",
                          row.delta > 0
                            ? "text-[var(--color-mint-600)]"
                            : "text-[var(--color-rose-600)]",
                        )}
                      >
                        {row.delta > 0 ? "▲" : "▼"}
                        {Math.abs(row.delta).toFixed(0)}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </TableShell>

      <Legend />
    </>
  );
}

function Legend() {
  const bands = [
    { label: "Top 3", tone: cellTone(2) },
    { label: "4–10", tone: cellTone(7) },
    { label: "11–20", tone: cellTone(15) },
    { label: "21–50", tone: cellTone(35) },
    { label: "51+", tone: cellTone(80) },
    { label: "Not ranking", tone: cellTone(null) },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-faint text-[11.5px]">Position bands:</span>
      {bands.map((b) => (
        <span
          key={b.label}
          className={cn("rounded-md px-2 py-0.5 text-[11px]", b.tone)}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
