import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* Presentational table shell. Filtering, sorting and pagination all happen
   server-side through URL params, so this stays a server component. */

export function TableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({
  children,
  className,
  minWidth,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <table
      className={cn("w-full border-collapse text-left text-[13px]", className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </table>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky-head">
      <tr
        className="border-b"
        style={{ borderColor: "var(--line-strong)" }}
      >
        {children}
      </tr>
    </thead>
  );
}

export function Th({
  children,
  className,
  align = "left",
  width,
  title,
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  width?: number | string;
  title?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      style={width ? { width } : undefined}
      className={cn(
        "text-muted px-3 py-2.5 text-[11.5px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  className,
  highlight = false,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b transition-colors last:border-0 hover:bg-[var(--surface-hover)]",
        highlight && "bg-[var(--accent-soft)]/40",
        className,
      )}
      style={{ borderColor: "var(--line-soft)" }}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
  align = "left",
  numeric = false,
  title,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  title?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        "text-body px-3 py-2.5 align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tnum",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Full-width message row for empty result sets. */
export function TrEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-12 text-center">
        {children}
      </td>
    </tr>
  );
}

/** Row count + range summary shown above the pager. */
export function TableMeta({
  total,
  page,
  pageSize,
  label = "rows",
}: {
  total: number;
  page: number;
  pageSize: number;
  label?: string;
}) {
  if (total === 0) return <span className="text-faint text-[12.5px]">No {label}</span>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <span className="text-muted tnum text-[12.5px]">
      {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {label}
    </span>
  );
}
