"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TabItem = {
  value: string;
  label: string;
  count?: number | null;
  icon?: ReactNode;
};

/** Controlled pill tabs. */
export function Tabs({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "well inline-flex max-w-full gap-1 overflow-x-auto p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl font-medium whitespace-nowrap transition-all",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active
                ? "surface-raised text-strong shadow-[var(--elev-1),var(--rim)]"
                : "text-muted hover:text-strong",
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span
                className={cn(
                  "tnum rounded-md px-1.5 text-[11px]",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "surface-sunken text-faint",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Tabs that write to a URL search param, so the state survives a reload. */
export function QueryTabs({
  items,
  param = "tab",
  defaultValue,
  className,
}: {
  items: TabItem[];
  param?: string;
  defaultValue?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get(param) ?? defaultValue ?? items[0]?.value;

  return (
    <Tabs
      items={items}
      value={current}
      className={className}
      onChange={(value) => {
        const next = new URLSearchParams(search.toString());
        if (value === (defaultValue ?? items[0]?.value)) next.delete(param);
        else next.set(param, value);
        next.delete("page");
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    />
  );
}

/** Horizontal nav for project sections. */
export function NavTabs({
  items,
  className,
}: {
  items: { href: string; label: string; icon?: ReactNode; exact?: boolean }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        "-mx-1 flex gap-1 overflow-x-auto px-1 pb-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-medium whitespace-nowrap transition-all",
              active
                ? "surface-raised text-strong shadow-[var(--elev-1),var(--rim)]"
                : "text-muted hover:surface-raised/60 hover:text-strong",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
