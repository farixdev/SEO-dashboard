import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── Numbers ───────────────────────────────────────────────────── */

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 12345 → "12.3K", 1250000 → "1.25M" */
export function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Safe division that yields 0 instead of NaN/Infinity. */
export function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function percentOf(numerator: number, denominator: number) {
  return ratio(numerator, denominator) * 100;
}

/**
 * Month-on-month change, or null when there is nothing to compare against.
 *
 * Substituting 1 for a missing previous month turns the first month of a
 * campaign into "▲ 293,000%" on the client's dashboard. Growth from zero has
 * no percentage — the honest answer is to show no delta at all, which every
 * stat component already handles.
 */
export function deltaPercent(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return percentOf(current - previous, previous);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/* ── Dates & months ────────────────────────────────────────────── */

/** The workbook keyed everything by month — we normalise to YYYY-MM-01. */
/**
 * Excel stores a date as "days since 1899-12-30". SheetJS's `cellDates`
 * option turns that into a Date at LOCAL midnight, so on any host east of
 * UTC the value rolls back a day the moment it is serialised — 9/1/2025
 * becomes 2025-08-31. Reading the raw serial and doing the arithmetic in
 * UTC gives the date the client sees in their spreadsheet, on every host.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  return new Date(EXCEL_EPOCH_UTC + Math.round(serial * 86_400_000));
}

export function monthKey(input: Date | string | number): string {
  const d =
    typeof input === "number"
      ? excelSerialToDate(input)
      : typeof input === "string"
        ? parseLooseDate(input)
        : input;
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + delta, 1));
  return monthKey(d);
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-06-01" → "Jun-26" (the label style used throughout the sheet) */
export function monthLabel(key: string | Date | null | undefined) {
  if (!key) return "—";
  const s = typeof key === "string" ? key : monthKey(key);
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return "—";
  return `${MONTHS_SHORT[m - 1]}-${String(y).slice(2)}`;
}

/** "2026-06-01" → "June 2026" */
export function monthLabelLong(key: string | Date | null | undefined) {
  if (!key) return "—";
  const s = typeof key === "string" ? key : monthKey(key);
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return "—";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDate(input: Date | string | null | undefined) {
  if (!input) return "—";
  const d = typeof input === "string" ? parseLooseDate(input) : input;
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(input: Date | string | null | undefined) {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(input: Date | string | null | undefined) {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(seconds) >= secs) return rtf.format(-Math.round(seconds / secs), unit);
  }
  return rtf.format(-seconds, "second");
}

/**
 * Accepts the many date shapes the workbook (and pasted CSV) throws at us:
 * ISO, "Jun-26", "Jun,26", "10/09/2024", Excel serial numbers.
 */
export function parseLooseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    // Excel serial date → JS date (epoch 1899-12-30 to absorb the 1900 leap bug)
    if (value > 20000 && value < 60000) {
      return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Jun-26 / Jun,26 / Jun 2026
  const short = raw.match(/^([A-Za-z]{3,})[\s,\-]+(\d{2,4})$/);
  if (short) {
    const mi = MONTHS_SHORT.findIndex(
      (m) => m.toLowerCase() === short[1].slice(0, 3).toLowerCase(),
    );
    if (mi >= 0) {
      let year = Number(short[2]);
      if (year < 100) year += year < 70 ? 2000 : 1900;
      return new Date(Date.UTC(year, mi, 1));
    }
  }

  // 2026-06-01 / 2026/06/01
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (iso) {
    return new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] ?? 1)),
    );
  }

  // 10/09/2024 → treated as DD/MM/YYYY when unambiguous, else MM/DD/YYYY
  const slash = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    let year = Number(y);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let day = Number(a);
    let month = Number(b);
    if (month > 12) [day, month] = [month, day];
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Date → "YYYY-MM-DD" for Postgres `date` columns. */
export function toDateString(input: Date | string | number | null | undefined) {
  const d =
    typeof input === "number"
      ? excelSerialToDate(input)
      : typeof input === "string"
        ? parseLooseDate(input)
        : input;
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/* ── Strings ───────────────────────────────────────────────────── */

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(input: string | null | undefined, max = 60) {
  if (!input) return "—";
  return input.length > max ? `${input.slice(0, max - 1)}…` : input;
}

/** "https://mindcob.com/local-seo-canada/" → "mindcob.com/local-seo-canada" */
export function prettyUrl(url: string | null | undefined, max = 48) {
  if (!url) return "—";
  const stripped = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return truncate(stripped, max);
}

export function hostOf(url: string | null | undefined) {
  if (!url) return "—";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "—";
  }
}

/** Cleans zero-width + non-breaking junk that came in from the sheet. */
/**
 * A handful of backlink rows in the workbook were typed without a scheme
 * ("web.trustexchange.com/company.php?q=..."). They are still real links and
 * still count as the team's work, so they are normalised rather than dropped.
 * Shared by the importer and the parity check so both read the sheet the same
 * way — that is data entry, not a decision about what to keep.
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // A bare host, optionally followed by a path — "example.com" or "example.com/x".
  if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(value)) return `https://${value}`;
  return null;
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value)
    // Currency, percent and thousands separators.
    .replace(/[$£€,%\s]/g, "")
    // Search Console caps some figures as "1000+"; take the number it gives us.
    .replace(/[+~]+$/, "")
    .replace(/^[~<>]+/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toInt(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.round(n);
}

/** The sheet mixed TRUE/FALSE, "Y"/"N", 1/0 and "Yes"/"No". */
export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const s = cleanText(value)?.toLowerCase();
  if (!s) return false;
  return ["y", "yes", "true", "1", "done", "published", "indexed", "✓"].includes(s);
}

/* ── Collections ───────────────────────────────────────────────── */

export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function sum(items: number[]) {
  return items.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

export function average(items: number[]) {
  const valid = items.filter((n) => Number.isFinite(n));
  return valid.length ? sum(valid) / valid.length : 0;
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

/* ── Domain helpers ────────────────────────────────────────────── */

/** Google position → SERP page (1-based, 10 results per page). */
export function positionToPage(position: number | null | undefined) {
  if (position === null || position === undefined || position <= 0) return null;
  return Math.ceil(position / 10);
}

/** Lower position is better, so the delta sign is inverted for display. */
export function rankDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  if (current == null || previous == null) return null;
  return previous - current;
}

export type Trend = "up" | "down" | "flat";

export function trendOf(delta: number | null | undefined): Trend {
  if (delta === null || delta === undefined || Math.abs(delta) < 0.01) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Spam score bands used by the health chips. */
export function spamBand(score: number | null | undefined) {
  if (score === null || score === undefined) return "unknown" as const;
  if (score <= 2) return "low" as const;
  if (score <= 5) return "medium" as const;
  return "high" as const;
}

export function daBand(da: number | null | undefined) {
  if (da === null || da === undefined) return "unknown" as const;
  if (da >= 50) return "strong" as const;
  if (da >= 30) return "good" as const;
  if (da >= 15) return "fair" as const;
  return "weak" as const;
}
