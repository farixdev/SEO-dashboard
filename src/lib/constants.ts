/* ────────────────────────────────────────────────────────────────
   Every enum in the system, in one place.
   Mirrors the "Backend" sheet, extended where the sheet was thin.
   ──────────────────────────────────────────────────────────────── */

export const USER_ROLES = ["ADMIN", "MANAGER", "SPECIALIST", "CLIENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "SEO Manager",
  SPECIALIST: "SEO Specialist",
  CLIENT: "Client",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Full access. Manages users, projects and billing.",
  MANAGER: "Runs projects end to end. Adds and edits all SEO data.",
  SPECIALIST: "Builds links and updates the data they are assigned.",
  CLIENT: "Read-only portal for their own project, plus messaging.",
};

/** Team-side roles — everything that is not a client. */
export const STAFF_ROLES: UserRole[] = ["ADMIN", "MANAGER", "SPECIALIST"];

export const PROJECT_MEMBER_ROLES = [
  "OWNER",
  "MANAGER",
  "SPECIALIST",
  "CLIENT_VIEWER",
] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const PROJECT_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/* ── Backlinks ─────────────────────────────────────────────────── */

export const BACKLINK_TYPES = [
  "Guest Posts",
  "Profile Build Links",
  "Local Citation",
  "Article Submission",
  "Miscellaneous",
  "Ads Posting",
  "Web 2.0",
  "Social Bookmarking",
  "Forum Posting",
  "Image Sharing",
  "Video Submission",
  "PDF Submission",
] as const;
export type BacklinkType = (typeof BACKLINK_TYPES)[number];

/** Sheet "Backlinks" column C validation: "Published,Pending,Wrong,Removed". */
export const BACKLINK_STATUSES = [
  "Published",
  "Pending",
  "Wrong",
  "Removed",
] as const;
export type BacklinkStatus = (typeof BACKLINK_STATUSES)[number];

/** Only published links count towards a keyword's target. */
export const BACKLINK_STATUS_HINTS: Record<BacklinkStatus, string> = {
  Published: "Live on the target site.",
  Pending: "Submitted, waiting to go live.",
  Wrong: "Placed incorrectly — wrong anchor, wrong URL, or wrong page.",
  Removed: "Was live, has since been taken down.",
};

/* ── Keywords ──────────────────────────────────────────────────── */

/** Sheet "Backend" column D. "Commercial" is an addition, not in the workbook. */
export const KEYWORD_INTENTS = [
  "Informational",
  "Transactional",
  "Navigational",
  "Commercial",
  "Listing",
] as const;
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

/* ── Pages ─────────────────────────────────────────────────────── */

/** Sheet "On Page SEO" column N validation, in the workbook's own order. */
export const PAGE_TYPES = [
  "Page",
  "Category Page",
  "Service Page",
  "Location Page",
  "Industry Page",
  "Case Study Page",
  "Blog",
  "Landing Page",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Sheet "On Page SEO" column F validation: "80+,70+,<70". */
export const SEO_SCORE_BUCKETS = ["80+", "70+", "<70"] as const;
export type SeoScoreBucket = (typeof SEO_SCORE_BUCKETS)[number];

/**
 * The workbook colour-coded the SR-NO cell of each page row:
 *
 *   green  = 80+  AND indexed AND on-page done
 *   amber  = 70+  AND indexed AND on-page done
 *   red    = <70  AND not indexed AND not on-page done
 *
 * Reproduced here so the same signal is visible in the table.
 */
export type PageHealth = "strong" | "fair" | "weak" | "mixed";

export function pageHealth(input: {
  seoScore: string | null;
  indexed: boolean;
  onPageDone: boolean;
}): PageHealth {
  const { seoScore, indexed, onPageDone } = input;
  if (seoScore === "80+" && indexed && onPageDone) return "strong";
  if (seoScore === "70+" && indexed && onPageDone) return "fair";
  if (seoScore === "<70" && !indexed && !onPageDone) return "weak";
  return "mixed";
}

export const PAGE_HEALTH_LABELS: Record<PageHealth, string> = {
  strong: "Strong — 80+, indexed, on-page complete",
  fair: "Fair — 70+, indexed, on-page complete",
  weak: "Weak — under 70, not indexed, on-page outstanding",
  mixed: "In progress — some checks still outstanding",
};

/* ── Tasks ─────────────────────────────────────────────────────── */

export const TASK_STATUSES = ["BACKLOG", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  IN_PROGRESS: "In progress",
  REVIEW: "In review",
  DONE: "Done",
};

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_CATEGORIES = [
  "ON_PAGE",
  "OFF_PAGE",
  "CONTENT",
  "TECHNICAL",
  "REPORTING",
  "OTHER",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  ON_PAGE: "On-page",
  OFF_PAGE: "Off-page",
  CONTENT: "Content",
  TECHNICAL: "Technical",
  REPORTING: "Reporting",
  OTHER: "Other",
};

/* ── Misc ──────────────────────────────────────────────────────── */

export const COUNTRIES = [
  "Canada",
  "United States",
  "United Kingdom",
  "Australia",
  "United Arab Emirates",
  "Pakistan",
  "India",
  "Germany",
  "Global",
] as const;

export const AVATAR_COLORS = [
  "indigo",
  "violet",
  "sky",
  "teal",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** Google SERP pages we chart in the rank-distribution widget. */
export const TRACKED_SERP_PAGES = [1, 2, 3, 4, 5] as const;

export const SESSION_COOKIE = "seo_session";

export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 50;
