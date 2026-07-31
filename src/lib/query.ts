import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./constants";

/** Next 15+ hands page/layout `searchParams` in as a promise of this shape. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type ListQuery = {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  /** every remaining param, first value only — used for column filters */
  filters: Record<string, string>;
};

const RESERVED = new Set(["q", "page", "pageSize", "sort", "dir"]);

export function parseListQuery(
  params: RawSearchParams,
  options: { defaultSort?: string; defaultDir?: "asc" | "desc" } = {},
): ListQuery {
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const pageSizeRaw = Number(one("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;

  const pageRaw = Number(one("page"));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key)) continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") filters[key] = v;
  }

  const dirRaw = one("dir");

  return {
    q: (one("q") ?? "").trim(),
    page,
    pageSize,
    sort: one("sort") ?? options.defaultSort ?? "createdAt",
    dir: dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (options.defaultDir ?? "desc"),
    filters,
  };
}

export function buildSearchString(
  current: RawSearchParams,
  patch: Record<string, string | number | null | undefined>,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined && v !== "") next.set(key, v);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function offsetOf(query: ListQuery) {
  return (query.page - 1) * query.pageSize;
}

export function totalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}
