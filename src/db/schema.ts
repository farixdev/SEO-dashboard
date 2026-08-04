import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────
   Conventions
   - uuid v4 primary keys, generated in Postgres
   - every tenant-scoped row carries project_id and cascades on delete
   - enum-ish columns are `text` validated by zod (see lib/constants.ts)
     so the agency can add a backlink type without a migration
   ──────────────────────────────────────────────────────────────── */

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ── Users ─────────────────────────────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    /** ADMIN | MANAGER | SPECIALIST | CLIENT */
    role: varchar("role", { length: 24 }).notNull().default("SPECIALIST"),
    title: varchar("title", { length: 120 }),
    phone: varchar("phone", { length: 40 }),
    avatarColor: varchar("avatar_color", { length: 16 }).notNull().default("indigo"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    /*
     * One-time invite link. Only the SHA-256 of the token is stored, so a
     * database leak cannot be replayed into an account — the raw token exists
     * only in the URL handed to the person being invited.
     */
    inviteTokenHash: varchar("invite_token_hash", { length: 64 }),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    inviteAcceptedAt: timestamp("invite_accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    // Invite redemption looks the account up by token hash.
    index("users_invite_token_idx").on(t.inviteTokenHash),
  ],
);

/* ── Projects (one per client website) ─────────────────────────── */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    websiteUrl: text("website_url").notNull(),
    clientCompany: varchar("client_company", { length: 160 }),
    country: varchar("country", { length: 80 }).notNull().default("Canada"),
    /** ACTIVE | PAUSED | COMPLETED | ARCHIVED */
    status: varchar("status", { length: 24 }).notNull().default("ACTIVE"),
    startDate: date("start_date"),
    /** targets drive the progress rings on both dashboards */
    monthlyBacklinkTarget: integer("monthly_backlink_target").notNull().default(50),
    monthlyKeywordTarget: integer("monthly_keyword_target").notNull().default(5),
    monthlyContentTarget: integer("monthly_content_target").notNull().default(4),
    accentColor: varchar("accent_color", { length: 16 }).notNull().default("indigo"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("projects_slug_unique").on(t.slug)],
);

/** Who can see / touch a project. Clients get CLIENT_VIEWER. */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** OWNER | MANAGER | SPECIALIST | CLIENT_VIEWER */
    role: varchar("role", { length: 24 }).notNull().default("SPECIALIST"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
  ],
);

/* ── On-Page SEO  (sheet: "On Page SEO") ───────────────────────── */

export const pages = pgTable(
  "pages",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    targetUrl: text("target_url"),
    focusKeyword: varchar("focus_keyword", { length: 300 }),
    /** Page | Category Page | Service Page | Location Page | Landing Page | Blog | Case Study Page */
    type: varchar("type", { length: 40 }).notNull().default("Page"),
    /** on-page optimisation finished? (sheet col E) */
    onPageDone: boolean("on_page_done").notNull().default(false),
    /** "70+" / "80+" / "90+" buckets, kept as text like the sheet */
    seoScore: varchar("seo_score", { length: 12 }),
    indexed: boolean("indexed").notNull().default(false),
    wordCount: integer("word_count"),
    hasFaqs: boolean("has_faqs").notNull().default(false),
    hasBlogSection: boolean("has_blog_section").notNull().default(false),
    hasReviewSection: boolean("has_review_section").notNull().default(false),
    hasCaseStudySection: boolean("has_case_study_section").notNull().default(false),
    /** extras the sheet lacked */
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("pages_project_idx").on(t.projectId),
    uniqueIndex("pages_project_title_unique").on(t.projectId, t.title),
  ],
);

/* ── Keywords  (sheet: "Keywords List") ────────────────────────── */

export const keywords = pgTable(
  "keywords",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 400 }).notNull(),
    /** Informational | Transactional | Navigational | Commercial | Listing */
    intent: varchar("intent", { length: 32 }),
    /** monthly search volume — sheet called this "Traffic" */
    volume: integer("volume"),
    /** keyword difficulty 0-100 */
    kd: real("kd"),
    cpc: numeric("cpc", { precision: 10, scale: 2 }),
    competition: real("competition"),
    ads: integer("ads"),
    /** the page this keyword is mapped to; target URL + focus kw are derived */
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    priority: boolean("priority").notNull().default(false),
    /** backlinks we intend to point at this keyword (sheet "Target") */
    backlinkTarget: integer("backlink_target").notNull().default(0),
    monthlyTarget: integer("monthly_target"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("keywords_project_idx").on(t.projectId),
    index("keywords_page_idx").on(t.pageId),
    uniqueIndex("keywords_project_keyword_unique").on(t.projectId, t.keyword),
  ],
);

/* ── Backlinks  (sheet: "Backlinks") ───────────────────────────── */

export const backlinks = pgTable(
  "backlinks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Guest Posts | Profile Build Links | Local Citation | … (see constants) */
    type: varchar("type", { length: 48 }).notNull().default("Guest Posts"),
    /** Published | Pending | Rejected | Removed */
    status: varchar("status", { length: 24 }).notNull().default("Pending"),
    indexed: boolean("indexed").notNull().default(false),
    anchorText1: varchar("anchor_text_1", { length: 400 }),
    anchorText2: varchar("anchor_text_2", { length: 400 }),
    /** the day the link went live — everything monthly is derived from this */
    publishedDate: date("published_date"),
    /** the SEO specialist who built it (sheet: "Expert Name") */
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** kept for rows imported before the specialist had an account */
    assigneeName: varchar("assignee_name", { length: 160 }),
    da: real("da"),
    pa: real("pa"),
    spamScore: real("spam_score"),
    /** ⚠️ INTERNAL ONLY — never selected in client-facing queries */
    loginUser: varchar("login_user", { length: 255 }),
    loginPassword: text("login_password"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("backlinks_project_idx").on(t.projectId),
    index("backlinks_project_date_idx").on(t.projectId, t.publishedDate),
    index("backlinks_assignee_idx").on(t.assigneeId),
    /*
     * Anchor text is matched to keywords case- and whitespace-insensitively,
     * the way the workbook's COUNTIFS did, so the indexes have to be on the
     * same expression or the join degrades to a sequential scan.
     */
    index("backlinks_anchor1_lower_idx").on(
      t.projectId,
      sql`lower(btrim(${t.anchorText1}))`,
    ),
    index("backlinks_anchor2_lower_idx").on(
      t.projectId,
      sql`lower(btrim(${t.anchorText2}))`,
    ),
  ],
);

/* ── Rank tracking  (sheet: "Keyword Analysis" — 16 month columns) ── */

export const rankings = pgTable(
  "rankings",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    /** always normalised to the 1st of the month */
    month: date("month").notNull(),
    /** the exact check date, if known */
    checkedOn: date("checked_on"),
    /** Google SERP page (1 = first page) */
    page: real("page"),
    /** absolute position; sheet stored decimals for averaged positions */
    position: real("position"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("rankings_keyword_month_unique").on(t.keywordId, t.month),
    index("rankings_project_month_idx").on(t.projectId, t.month),
  ],
);

/* ── Search Console + GA  (sheet: "Analytics and Search Console Da") ── */

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    capturedOn: date("captured_on"),
    country: varchar("country", { length: 80 }).notNull().default("Canada"),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    /** how many keywords GSC saw that month; sheet sometimes wrote "1000+" */
    keywordCount: integer("keyword_count"),
    keywordCountLabel: varchar("keyword_count_label", { length: 24 }),
    /** GA4 organic sessions */
    gaTraffic: integer("ga_traffic"),
    avgPosition: real("avg_position"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("analytics_project_month_country_unique").on(
      t.projectId,
      t.month,
      t.country,
    ),
    index("analytics_project_idx").on(t.projectId),
  ],
);

/* ── Deliverables board (new — the sheet had no task tracking) ──── */

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    /** BACKLOG | IN_PROGRESS | REVIEW | DONE */
    status: varchar("status", { length: 24 }).notNull().default("BACKLOG"),
    /** LOW | MEDIUM | HIGH | URGENT */
    priority: varchar("priority", { length: 16 }).notNull().default("MEDIUM"),
    /** ON_PAGE | OFF_PAGE | CONTENT | TECHNICAL | REPORTING | OTHER */
    category: varchar("category", { length: 24 }).notNull().default("OTHER"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    /** visible to the client on their portal? */
    clientVisible: boolean("client_visible").notNull().default(true),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_project_status_idx").on(t.projectId, t.status),
    index("tasks_assignee_idx").on(t.assigneeId),
  ],
);

/* ── Messaging (client ↔ agency, per project) ──────────────────── */

export const threads = pgTable(
  "threads",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 300 }).notNull(),
    /** OPEN | RESOLVED */
    status: varchar("status", { length: 16 }).notNull().default("OPEN"),
    /** internal threads are hidden from the client portal */
    isInternal: boolean("is_internal").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("threads_project_idx").on(t.projectId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    /** [{ name, url }] — links the team pastes (reports, docs) */
    attachments: jsonb("attachments").$type<{ name: string; url: string }[]>(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

/** last-read marker per user per thread → drives unread badges */
export const threadReads = pgTable(
  "thread_reads",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

/**
 * Who a conversation is addressed to.
 *
 * A thread with NO rows here behaves exactly as it always has: everyone on the
 * project can see it, subject to `is_internal`. Adding rows narrows it to those
 * people plus whoever started it — which is how an admin holds a private word
 * with one specialist, or with the client alone.
 *
 * Deliberately additive: every existing thread has no participants, so nothing
 * changes for them.
 */
export const threadParticipants = pgTable(
  "thread_participants",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index("thread_participants_user_idx").on(t.userId),
  ],
);

/* ── Audit trail ───────────────────────────────────────────────── */

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 160 }),
    /** created | updated | deleted | imported | logged_in | … */
    action: varchar("action", { length: 40 }).notNull(),
    entity: varchar("entity", { length: 40 }).notNull(),
    entityId: uuid("entity_id"),
    summary: text("summary"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_project_idx").on(t.projectId, t.createdAt)],
);

/* ── Relations ─────────────────────────────────────────────────── */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(projectMembers),
  backlinks: many(backlinks),
  tasks: many(tasks),
  messages: many(messages),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  members: many(projectMembers),
  pages: many(pages),
  keywords: many(keywords),
  backlinks: many(backlinks),
  rankings: many(rankings),
  analytics: many(analyticsSnapshots),
  tasks: many(tasks),
  threads: many(threads),
  createdBy: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  project: one(projects, {
    fields: [pages.projectId],
    references: [projects.id],
  }),
  keywords: many(keywords),
}));

export const keywordsRelations = relations(keywords, ({ one, many }) => ({
  project: one(projects, {
    fields: [keywords.projectId],
    references: [projects.id],
  }),
  page: one(pages, { fields: [keywords.pageId], references: [pages.id] }),
  rankings: many(rankings),
}));

export const backlinksRelations = relations(backlinks, ({ one }) => ({
  project: one(projects, {
    fields: [backlinks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [backlinks.assigneeId],
    references: [users.id],
  }),
}));

export const rankingsRelations = relations(rankings, ({ one }) => ({
  project: one(projects, {
    fields: [rankings.projectId],
    references: [projects.id],
  }),
  keyword: one(keywords, {
    fields: [rankings.keywordId],
    references: [keywords.id],
  }),
}));

export const analyticsRelations = relations(analyticsSnapshots, ({ one }) => ({
  project: one(projects, {
    fields: [analyticsSnapshots.projectId],
    references: [projects.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  project: one(projects, {
    fields: [threads.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [threads.createdById],
    references: [users.id],
  }),
  messages: many(messages),
  reads: many(threadReads),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, {
    fields: [messages.threadId],
    references: [threads.id],
  }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
}));

export const threadParticipantsRelations = relations(threadParticipants, ({ one }) => ({
  thread: one(threads, {
    fields: [threadParticipants.threadId],
    references: [threads.id],
  }),
  user: one(users, {
    fields: [threadParticipants.userId],
    references: [users.id],
  }),
}));

export const threadReadsRelations = relations(threadReads, ({ one }) => ({
  thread: one(threads, {
    fields: [threadReads.threadId],
    references: [threads.id],
  }),
  user: one(users, { fields: [threadReads.userId], references: [users.id] }),
}));

/* ── Inferred types ────────────────────────────────────────────── */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Backlink = typeof backlinks.$inferSelect;
export type NewBacklink = typeof backlinks.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type NewRanking = typeof rankings.$inferInsert;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
