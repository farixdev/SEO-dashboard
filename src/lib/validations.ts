import { z } from "zod";

import {
  BACKLINK_STATUSES,
  BACKLINK_TYPES,
  KEYWORD_INTENTS,
  PAGE_TYPES,
  PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES,
  SEO_SCORE_BUCKETS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  USER_ROLES,
} from "./constants";

/* ── Primitives ────────────────────────────────────────────────── */

const trimmed = z.string().trim();

/** Empty strings from HTML forms become `undefined`, not "". */
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  trimmed.optional(),
);

const optionalNumber = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}, z.number().optional());

const optionalInt = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : undefined;
}, z.number().int().optional());

/** HTML checkboxes send "on" / nothing. */
const checkbox = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === "1" || v === "Y",
  z.boolean(),
);

const optionalDate = z.preprocess((v) => {
  if (!v || (typeof v === "string" && v.trim() === "")) return undefined;
  return typeof v === "string" ? v.trim() : v;
}, z.string().optional());

const urlish = trimmed
  .min(1, "URL is required")
  .refine((v) => /^https?:\/\/.+\..+/i.test(v), "Enter a full URL including https://");

export const uuid = z.string().uuid("Invalid id");

/* ── Auth ──────────────────────────────────────────────────────── */

export const loginSchema = z.object({
  email: trimmed.min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  next: optionalText,
});

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "That is too long")
  .refine((v) => /[a-zA-Z]/.test(v), "Include at least one letter")
  .refine((v) => /[0-9]/.test(v), "Include at least one number");

/*
 * The two password screens share a shape but not a schema. They are built
 * from the shape rather than one being `.omit()`-ed from the other, because
 * `.omit()` throws on a schema that already carries a `.refine()`.
 */
const newPasswordShape = {
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
};

const passwordsMatch = {
  message: "Passwords do not match",
  path: ["confirmPassword"],
};

/** The forced first-password screen, for someone already signed in. */
export const setPasswordSchema = z
  .object(newPasswordShape)
  .refine((d) => d.password === d.confirmPassword, passwordsMatch);

/** Redeeming an invite link, which carries the token as well. */
export const acceptInviteSchema = z
  .object({
    token: trimmed.min(16, "Invalid invite link"),
    ...newPasswordShape,
  })
  .refine((d) => d.password === d.confirmPassword, passwordsMatch);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/* ── Users ─────────────────────────────────────────────────────── */

export const userCreateSchema = z.object({
  name: trimmed.min(2, "Name is required").max(160),
  email: trimmed.min(1, "Email is required").email("Enter a valid email"),
  role: z.enum(USER_ROLES),
  title: optionalText,
  phone: optionalText,
  password: passwordSchema,
  /** required when role === CLIENT */
  projectId: optionalText,
});

export const userUpdateSchema = z.object({
  id: uuid,
  name: trimmed.min(2, "Name is required").max(160),
  email: trimmed.min(1).email("Enter a valid email"),
  role: z.enum(USER_ROLES),
  title: optionalText,
  phone: optionalText,
  isActive: checkbox,
});

export const resetPasswordSchema = z.object({
  id: uuid,
  password: passwordSchema,
});

/* ── Projects ──────────────────────────────────────────────────── */

export const projectCreateSchema = z.object({
  name: trimmed.min(2, "Project name is required").max(160),
  websiteUrl: urlish,
  clientCompany: optionalText,
  country: trimmed.min(1).default("Canada"),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  startDate: optionalDate,
  monthlyBacklinkTarget: optionalInt,
  monthlyKeywordTarget: optionalInt,
  monthlyContentTarget: optionalInt,
  accentColor: optionalText,
  notes: optionalText,
  /** optional: create the client login in the same step */
  clientName: optionalText,
  clientEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    trimmed.email("Enter a valid client email").optional(),
  ),
  clientPassword: optionalText,
});

export const projectUpdateSchema = projectCreateSchema
  .omit({ clientName: true, clientEmail: true, clientPassword: true })
  .extend({ id: uuid });

export const projectMemberSchema = z.object({
  projectId: uuid,
  userId: uuid,
  role: z.enum(PROJECT_MEMBER_ROLES),
});

/* ── Pages (on-page SEO) ───────────────────────────────────────── */

export const pageSchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  title: trimmed.min(1, "Page title is required").max(300),
  targetUrl: optionalText,
  focusKeyword: optionalText,
  type: z.enum(PAGE_TYPES).default("Page"),
  onPageDone: checkbox,
  seoScore: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(SEO_SCORE_BUCKETS).optional(),
  ),
  indexed: checkbox,
  wordCount: optionalInt,
  hasFaqs: checkbox,
  hasBlogSection: checkbox,
  hasReviewSection: checkbox,
  hasCaseStudySection: checkbox,
  metaTitle: optionalText,
  metaDescription: optionalText,
  notes: optionalText,
});

/* ── Keywords ──────────────────────────────────────────────────── */

export const keywordSchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  keyword: trimmed.min(1, "Keyword is required").max(400),
  intent: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(KEYWORD_INTENTS).optional(),
  ),
  volume: optionalInt,
  kd: optionalNumber,
  cpc: optionalNumber,
  competition: optionalNumber,
  ads: optionalInt,
  pageId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    uuid.optional(),
  ),
  priority: checkbox,
  backlinkTarget: optionalInt,
  monthlyTarget: optionalInt,
});

/* ── Backlinks ─────────────────────────────────────────────────── */

export const backlinkSchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  url: urlish,
  type: z.enum(BACKLINK_TYPES).default("Guest Posts"),
  status: z.enum(BACKLINK_STATUSES).default("Pending"),
  indexed: checkbox,
  anchorText1: optionalText,
  anchorText2: optionalText,
  publishedDate: optionalDate,
  assigneeId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    uuid.optional(),
  ),
  da: optionalNumber,
  pa: optionalNumber,
  spamScore: optionalNumber,
  loginUser: optionalText,
  loginPassword: optionalText,
  notes: optionalText,
});

/* ── Rankings ──────────────────────────────────────────────────── */

export const rankingSchema = z.object({
  projectId: uuid,
  keywordId: uuid,
  month: trimmed.regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM"),
  page: optionalNumber,
  position: optionalNumber,
  checkedOn: optionalDate,
});

/** The rank grid saves a whole month in one shot. */
export const rankingBulkSchema = z.object({
  projectId: uuid,
  month: trimmed.regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM"),
  checkedOn: optionalDate,
  rows: z
    .array(
      z.object({
        keywordId: uuid,
        position: optionalNumber,
        page: optionalNumber,
      }),
    )
    .max(2000),
});

/* ── Analytics ─────────────────────────────────────────────────── */

export const analyticsSchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  month: trimmed.regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM"),
  capturedOn: optionalDate,
  country: trimmed.min(1).default("Canada"),
  clicks: optionalInt,
  impressions: optionalInt,
  keywordCount: optionalInt,
  keywordCountLabel: optionalText,
  gaTraffic: optionalInt,
  avgPosition: optionalNumber,
  notes: optionalText,
});

/* ── Tasks ─────────────────────────────────────────────────────── */

export const taskSchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  title: trimmed.min(2, "Give the task a title").max(300),
  description: optionalText,
  status: z.enum(TASK_STATUSES).default("BACKLOG"),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  category: z.enum(TASK_CATEGORIES).default("OTHER"),
  assigneeId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    uuid.optional(),
  ),
  dueDate: optionalDate,
  clientVisible: checkbox,
});

export const taskMoveSchema = z.object({
  id: uuid,
  status: z.enum(TASK_STATUSES),
});

/* ── Messaging ─────────────────────────────────────────────────── */

export const threadCreateSchema = z.object({
  projectId: uuid,
  subject: trimmed.min(2, "Add a subject").max(300),
  body: trimmed.min(1, "Write a message").max(8000),
  isInternal: checkbox,
  /**
   * Empty means the whole project, as before. Naming people narrows the
   * conversation to them — the action still checks each id really belongs to
   * the project, so a crafted post cannot pull in an outsider.
   */
  participantIds: z.preprocess(
    // parseForm hands back a bare string when only one box is ticked.
    (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
    z.array(uuid),
  ),
});

export const messageCreateSchema = z.object({
  threadId: uuid,
  body: trimmed.min(1, "Write a message").max(8000),
});

/* ── Bulk import ───────────────────────────────────────────────── */

export const importSchema = z.object({
  projectId: uuid,
  entity: z.enum(["backlinks", "keywords", "pages", "analytics", "rankings"]),
  /** raw CSV / TSV text pasted into the importer */
  content: z.string().min(1, "Paste some rows first").max(6_000_000),
  /** create keywords/pages referenced by name but not yet present */
  createMissing: checkbox,
  /** for rankings: which month the pasted positions belong to */
  month: optionalText,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type PageInput = z.infer<typeof pageSchema>;
export type KeywordInput = z.infer<typeof keywordSchema>;
export type BacklinkInput = z.infer<typeof backlinkSchema>;
export type AnalyticsInput = z.infer<typeof analyticsSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type ImportInput = z.infer<typeof importSchema>;
