"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import {
  beginNavigation,
  endNavigation,
} from "@/components/ui/route-progress";
import { PAGE_SIZES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Writes a search param, resetting pagination. */
function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    // Raise the shared flag for the duration of the transition, so the top
    // bar shows even though React is holding the old page on screen.
    beginNavigation();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // `pending` flips false when React finishes the transition; that is the
  // only reliable "it landed" signal we get from a router.replace.
  const settled = useRef(true);
  useEffect(() => {
    if (pending) {
      settled.current = false;
    } else if (!settled.current) {
      settled.current = true;
      endNavigation();
    }
  }, [pending]);

  return { set, pending, search, pathname };
}

/* ── Search box (debounced) ────────────────────────────────────── */

export function SearchInput({
  placeholder = "Search…",
  className,
  paramName = "q",
}: {
  placeholder?: string;
  className?: string;
  paramName?: string;
}) {
  const { set, search, pending } = useParamWriter();
  const urlValue = search.get(paramName) ?? "";
  const [value, setValue] = useState(urlValue);

  // Keep in sync when the URL changes from outside (back button, reset chip).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the URL back into the input when it changes from outside (back button, reset chip)
  useEffect(() => setValue(urlValue), [urlValue]);

  useEffect(() => {
    if (value === urlValue) return;
    const timer = window.setTimeout(() => set({ [paramName]: value || null }), 320);
    return () => window.clearTimeout(timer);
    // `set` is stable enough for this purpose; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, urlValue, paramName]);

  return (
    <div className={cn("relative", className)}>
      <Search
        className={cn(
          "text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2",
          pending && "animate-pulse",
        )}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-9 w-full rounded-xl pr-8 pl-9 text-[13px]",
          "surface-sunken text-strong shadow-[var(--inset-well)]",
          "placeholder:text-[var(--text-faint)]",
          "border border-transparent focus:border-[var(--accent)] focus:outline-none",
          "focus:ring-2 focus:ring-[var(--accent-ring)]",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {value ? (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="text-faint hover:text-strong absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ── Filter select ─────────────────────────────────────────────── */

export function FilterSelect({
  paramName,
  options,
  allLabel = "All",
  className,
  label,
}: {
  paramName: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
  label?: string;
}) {
  const { set, search, pending } = useParamWriter();
  const value = search.get(paramName) ?? "";
  return (
    <div
      className={cn("relative transition-opacity", pending && "opacity-60", className)}
    >
      <select
        aria-busy={pending}
        aria-label={label ?? allLabel}
        value={value}
        onChange={(e) => set({ [paramName]: e.target.value || null })}
        className={cn(
          "h-9 w-full appearance-none rounded-xl pr-8 pl-3 text-[13px] font-medium",
          value
            ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-none"
            : "surface-sunken text-body shadow-[var(--inset-well)]",
          "border border-transparent focus:border-[var(--accent)] focus:outline-none",
        )}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-60"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ── Active-filter chips + reset ───────────────────────────────── */

export function FilterChips({
  labels,
}: {
  /** param name → human label, e.g. { type: "Type", status: "Status" } */
  labels: Record<string, string>;
}) {
  const { set, search, pending } = useParamWriter();
  const active = Object.entries(labels).filter(([key]) => search.get(key));
  const q = search.get("q");
  if (!active.length && !q) return null;

  return (
    <div
      aria-busy={pending}
      className={cn(
        "flex flex-wrap items-center gap-1.5 transition-opacity",
        pending && "opacity-60",
      )}
    >
      {q ? (
        <Chip label="Search" value={q} onRemove={() => set({ q: null })} />
      ) : null}
      {active.map(([key, label]) => (
        <Chip
          key={key}
          label={label}
          value={search.get(key)!}
          onRemove={() => set({ [key]: null })}
        />
      ))}
      <button
        onClick={() =>
          set(
            Object.fromEntries([
              ...Object.keys(labels).map((k) => [k, null]),
              ["q", null],
            ]),
          )
        }
        className="text-faint hover:text-strong ml-1 text-[12px] font-medium underline underline-offset-2"
      >
        Clear all
      </button>
    </div>
  );
}

function Chip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="bg-[var(--accent-soft)] text-[var(--accent)] inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium">
      <span className="opacity-70">{label}:</span>
      <span className="max-w-[16ch] truncate">{value.replace(/_/g, " ")}</span>
      <button onClick={onRemove} aria-label={`Remove ${label} filter`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

/* ── Sortable column header ────────────────────────────────────── */

export function SortHeader({
  column,
  children,
  align = "left",
  defaultDir = "desc",
}: {
  column: string;
  children: ReactNode;
  align?: "left" | "right" | "center";
  defaultDir?: "asc" | "desc";
}) {
  const { set, search, pending } = useParamWriter();
  const activeCol = search.get("sort");
  const dir = search.get("dir") ?? "desc";
  const active = activeCol === column;

  return (
    <button
      aria-busy={pending}
      onClick={() =>
        set({
          sort: column,
          dir: active ? (dir === "asc" ? "desc" : "asc") : defaultDir,
        })
      }
      className={cn(
        "group inline-flex w-full items-center gap-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase transition-colors",
        pending && "opacity-60",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
        active ? "text-strong" : "text-muted hover:text-strong",
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
        aria-hidden
      >
        {active && dir === "asc" ? "↑" : "↓"}
      </span>
    </button>
  );
}

/* ── Pagination ────────────────────────────────────────────────── */

export function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const search = useSearchParams();
  const pathname = usePathname();

  const href = (p: number) => {
    const next = new URLSearchParams(search.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (totalPages <= 1) return null;

  // Windowed page numbers: 1 … 4 5 [6] 7 8 … 20
  const window: (number | "gap")[] = [];
  const push = (n: number) => window.push(n);
  push(1);
  if (page > 3) window.push("gap");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
    push(p);
  }
  if (page < totalPages - 2) window.push("gap");
  if (totalPages > 1) push(totalPages);

  return (
    <nav className="flex items-center gap-1" aria-label="Pagination">
      <PagerLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
        <ChevronLeft className="size-4" />
      </PagerLink>
      {window.map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} className="text-faint px-1 text-[13px]">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={href(item)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "tnum grid h-8 min-w-8 place-items-center rounded-xl px-2 text-[13px] font-medium transition-all",
              item === page
                ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--elev-1)]"
                : "text-muted hover:surface-raised hover:text-strong",
            )}
          >
            <PageNumber value={item} />
          </Link>
        ),
      )}
      <PagerLink
        href={href(page + 1)}
        disabled={page >= totalPages}
        label="Next page"
      >
        <ChevronRight className="size-4" />
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const base =
    "grid size-8 place-items-center rounded-xl transition-colors text-muted";
  if (disabled) {
    return (
      <span className={cn(base, "opacity-30")} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(base, "hover:surface-raised hover:text-strong")}
    >
      {children}
    </Link>
  );
}

export function PageSizeSelect() {
  const { set, search, pending } = useParamWriter();
  return (
    <label
      className={cn(
        "text-faint flex items-center gap-1.5 text-[12.5px] transition-opacity",
        pending && "opacity-60",
      )}
    >
      Rows
      <select
        aria-busy={pending}
        value={search.get("pageSize") ?? "50"}
        onChange={(e) => set({ pageSize: e.target.value, page: null })}
        className="surface-sunken text-body h-7 rounded-lg px-1.5 text-[12.5px] shadow-[var(--inset-well)] focus:outline-none"
        aria-label="Rows per page"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Renders inside <Link>, which is the only place `useLinkStatus` works. Paging
 * a big table is a full server round trip; without this the number just sits
 * there and people click it again.
 */
function PageNumber({ value }: { value: number }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("transition-opacity", pending && "opacity-50")}>
      {value}
    </span>
  );
}

/** Wraps the filter row so every list page has the same rhythm. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
