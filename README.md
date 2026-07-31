# SEO Dashboard

A multi-project SEO management app that replaces the *Mindcob New SEO Dashboard*
spreadsheet. Two actors, one database:

- **Agency console** (`/app`) — admins, managers and specialists add and manage
  every piece of data: keywords, pages, backlinks, monthly rankings, Search
  Console figures, deliverables and team performance.
- **Client portal** (`/portal`) — each client gets read-only access to *their*
  project, written in plain language, plus a message thread to their team.

Built with Next.js 16 (App Router), Neon Postgres, Drizzle ORM and Tailwind v4.

---

## Quick start (Windows)

Double-click **`start.bat`** and pick an option. It checks Node, installs
dependencies if they are missing, creates the database schema and admin login,
offers to import your workbook, then starts the app and opens the browser.

It is safe to re-run at any point — every step detects what is already done and
skips it.

```
start.bat            menu
start.bat dev        set up whatever is missing, then run
start.bat check      environment report
start.bat setup      create schema + admin login
start.bat import     load the workbook
start.bat parity     compare the database against the workbook
start.bat build      production build, then serve
start.bat test       typecheck and unit tests
```

Set `NO_COLOR=1` if your console does not render colour.

The rest of this section is the manual equivalent, and applies on any platform.

---

## Getting started

### 1. Create the database

1. Sign up at [console.neon.tech](https://console.neon.tech) and create a project.
2. Open **Connect** and copy the **pooled** connection string. It looks like:
   ```
   postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Configure

Paste it into `.env.local` (already created for you), and set a real auth secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```ini
DATABASE_URL="postgresql://…?sslmode=require"
AUTH_SECRET="<paste the generated string>"
```

### 3. Create the schema and the first admin

```bash
npm run setup
```

That runs `db:push` (creates all 13 tables) then `db:seed`, which prints the
admin credentials. It also creates accounts for the six specialists named in the
workbook — Abu Turab, Waqas Ahmed, Faseeh, Abdur Rehman, Kamran, Sanan — so
imported backlinks attach to real people automatically.

### 4. Load your existing spreadsheet

Check what will happen first — this touches nothing:

```bash
npm run db:verify -- --file "C:/Users/User/Downloads/Mindcob New SEO Dashboard.xlsx"
```

Then import for real:

```bash
npm run db:import -- --file "C:/Users/User/Downloads/Mindcob New SEO Dashboard.xlsx"
```

Add `--reset` to clear the project's existing rows first, `--project "Name"` and
`--site "https://…"` to import a different client.

### 5. Run it

```bash
npm run dev
```

Sign in at [localhost:3000/login](http://localhost:3000/login).

---

## How the spreadsheet maps onto the app

| Workbook sheet | Where it lives now |
|---|---|
| **Dashboard** | Project overview — every COUNTIF is a grouped SQL query, plus charts the sheet had no room for |
| **Analytics and Search Console Da** | Search data tab. CTR and impression-growth are recalculated on read, so editing one month can never leave a stale figure behind |
| **On Page SEO** | On-page tab. The audit checklist is click-to-toggle; `Keywords` count is derived, not typed |
| **Backlinks** | Backlinks tab. Filter by type, status, index state, owner and month; bulk-edit selections; login credentials are **staff-only** |
| **Keywords List** | Keywords tab. `Target URL` and `Focus Keyword` come from the mapped page, so they cannot drift |
| **Keyword Analysis** | Rankings tab. The sheet grew two columns every month; here it is one row per (keyword, month), pivoted back into a grid on read. A bulk-entry screen saves a whole month in one submit |
| **Self Analysis** | Team tab — per-specialist output, index rates, quality flags |
| **Backend** | `src/lib/constants.ts` |

### Performance

Neon is reached over HTTP, and from here a single round trip costs a few hundred
milliseconds — so the work is in making fewer of them, not faster ones.

- **One session query, not two.** `getCurrentUser()` runs on every request and
  used to fetch the account row and then the project list sequentially. Folding
  the project list into a subquery removed a whole round trip: **~237ms off
  every page in the app**, measured. It is still uncached on purpose — a
  deactivated account or a changed role has to take effect on the very next
  request, not when a tag expires.
- **Cached reads.** Aggregates *and* the list queries behind the big tables are
  wrapped in `unstable_cache` with project-scoped tags (`src/lib/cache.ts`).
  The list queries were originally left out because "filter combinations are
  unbounded" — but the cache key already includes the arguments, so an unusual
  filter is simply its own entry with a TTL while the default view everyone
  loads stays hot.
- **Tag invalidation on every write.** All 40 mutating Server Actions call
  `invalidate*()`. Every project-scoped query also carries `project:<id>`,
  which every invalidate emits — so a missed dependency edge drops more cache
  than needed, never serves a stale figure. TTLs are only a backstop.
- **The browser keeps pages it has already loaded.** `experimental.staleTimes`
  (see `next.config.ts`). Every route is dynamic, and Next's default for those
  is `0`, so navigating Keywords → Backlinks → back to Keywords re-fetched
  Keywords every time. Safe to raise only because a write drops the client
  cache too: `purge()` calls `updateTag()`, and a tag without a cache profile
  makes Next set `x-action-revalidated`, which runs
  `invalidateEntirePrefetchCache()` on the client. Signing out clears it as
  well, since deleting the session cookie counts for the same header.
- **Shimmer while streaming.** 27 of the 28 routes have a `loading.tsx` shaped
  to that page's real layout, so content swaps in without the page jumping.

Warm server response, same machine, same data:

| Route | Before | After |
|---|---|---|
| Agency home | 821ms | 568ms |
| Project overview | 779ms | 548ms |
| Keywords | 1,575ms | 572ms |
| Backlinks | 1,388ms | 589ms |
| On-page | 1,386ms | 570ms |
| Rankings | 1,645ms | 654ms |
| Deliverables | 1,060ms | 512ms |
| **Total across 10 routes** | **11,112ms** | **5,600ms** |

Messaging is deliberately still uncached — it has to stay live.

> Two things worth knowing before you test this. `unstable_cache` writes through
> to `.next/cache`, so restarting the server does **not** give you a cold cache;
> delete `.next/cache` first. And `listBacklinks` is cached separately per
> projection — the staff call passes `includeSecrets`, the portal call does not,
> so they are different cache keys. `npm run verify:cache` plants a credential on a row,
> loads the staff page to warm the cache, and asserts the portal still cannot
> see it.

### Where the app deliberately differs from the workbook

`npm run db:parity` re-computes the sheet's own formulas and compares them to
what the app's SQL returns — 16,855 checks across every field, every rank cell
and every derived total, including the "Self Analysis" per-specialist table
compared against the totals Excel itself stored. It currently passes clean.

It reads the workbook **independently of the importer**. That matters: an
earlier version reused the importer's own row filters, so it compared the
importer's interpretation against the importer's output and agreed by
construction — it reported 16,723/16,723 while 14 real backlinks were missing
from the database. A parity check that shares the importer's assumptions cannot
detect the importer's mistakes.

Three differences are intentional and are called out in its output:

- **Case-insensitive anchor matching.** Excel's `COUNTIFS` ignores case, and the
  workbook relies on it — the anchor "SEO Services in Canada" is meant to count
  towards the keyword "seo services in canada". Matching exactly was silently
  dropping **491 links** from keyword progress. Now matched the same way Excel
  does, with expression indexes to keep the join fast.
- **A link counts once.** The sheet computes
  `SUM(COUNTIFS(anchor1=kw), COUNTIFS(anchor2=kw))`, so a backlink carrying the
  same keyword in both anchor slots is counted twice. One backlink is one link.
- **Live reporting month.** The sheet's rank-distribution formula pointed at a
  hard-coded column (`Keyword Analysis!AN`, Feb-26). Here every figure follows
  the selected month, and reports open on the newest month that actually holds
  data rather than the calendar month.

Everything else — the validation lists, the conditional-format colour rules, the
CTR and growth formulas, the per-specialist counts — is reproduced as-is. The
page-health dot in the on-page table is the workbook's green/amber/red row
colouring (`80+` & indexed & on-page done → green, and so on).

### What the app adds on top

- **Multi-project.** Everything is scoped to a project, so one install runs your
  whole book of business.
- **Two-actor auth.** Role-based, enforced server-side on every read and write.
- **Deliverables board.** Tasks per project, each flagged client-visible or internal.
- **Messaging.** Threads per project, unread badges, and internal threads the
  client never sees.
- **Printable monthly report** at `/portal/report`.
- **Paste-import** for every entity, matched against the workbook's own header names.
- **CSV export** on every table, in the sheet's column order.
- **Audit trail** of who changed what.
- **Light and dark**, and it works on a phone.

---

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything, including creating accounts and deleting projects |
| **SEO Manager** | Full data access across all projects |
| **SEO Specialist** | Reads and writes data on projects they are assigned to |
| **Client** | Read-only portal for their own project, plus messaging |

---

## Signing in

### The admin account

`npm run db:seed` creates it from `SEED_ADMIN_PASSWORD` in `.env.local`
(default `Admin@12345`):

    admin@mindcob.com  /  Admin@12345

That password is a setup default, not a credential — the account is flagged
`must_change_password`, so the first sign-in goes straight to a
**Choose a password** screen and the console stays closed until a new one is
set. The same applies to the six seeded specialist accounts.

### Giving a client access

The admin never handles the client's password. From **People & access**, or
from a project's **Settings → Who can access this project**, press
**Send invite**. That produces a one-time link:

    https://your-app.example.com/invite/<token>

Send it however you like — email, WhatsApp, a message in the portal. When the
client opens it they see who invited them, which site it is for, and a field to
choose their own password. Setting it signs them in and drops them on their
dashboard.

The link:

- works for **7 days** (`INVITE_TTL_DAYS`), then expires
- works **once** — re-opening it says "already used, sign in instead"
- can be revoked at any time, which kills it immediately
- is stored only as a SHA-256 hash, so a database leak cannot replay it

Because only the hash is kept, a link cannot be shown twice. Re-issuing is one
click and invalidates the previous one, which is the right default anyway.

Set `NEXT_PUBLIC_APP_URL` so generated links point at your real domain rather
than `localhost`.

### What the client sees

A read-only portal for their project only: rankings over time, keyword
positions, backlinks earned, Search Console clicks and impressions, a
month-by-month progress view, a printable report, and a message thread with the
agency. Backlink logins and passwords are never sent to the portal, and are
stripped from the client's CSV exports.

---

## Commands

| Command | What it does |
|---|---|
| `npm run doctor` | Environment report — config, connection, schema, row counts |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and serve |
| `npm test` | Unit tests for the date/number/CSV parsers |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next's React + accessibility rules) |
| `npm run db:push` | Sync the schema to Neon (development) |
| `npm run db:generate` | Write a migration SQL file to `drizzle/` |
| `npm run db:migrate` | Apply migrations (production) |
| `npm run db:seed` | Create the admin and specialist accounts |
| `npm run db:verify` | Dry-run a workbook import, no writes |
| `npm run db:import` | Import a workbook into a project |
| `npm run db:sync` | Add backlinks the workbook has and the database does not (dry run; `-- --apply` to write) |
| `npm run db:parity` | Compare the database against the workbook, cell by cell |
| `npm run verify:invite` | Walk the client invite flow against a running server |
| `npm run verify:gate` | Check the forced-password gate blocks the console |
| `npm run verify:cache` | Check cached reads stay fresh, and that staff credentials never reach the portal |
| `npm run verify:chat` | Check messaging and the unread badge, including that internal threads stay internal |
| `npm run db:studio` | Drizzle Studio, a GUI over the data |
| `npm run db:reset -- --yes` | Drop every table (destructive) |

`GET /api/health` reports whether the app can reach the database.

---

## Deploying

Full step-by-step for Vercel + Neon — env vars, cron, custom domain, verifying a
live deployment, and troubleshooting — is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

The short version: Neon pooled connection string into `DATABASE_URL`, a random
`AUTH_SECRET`, run `db:migrate` + `db:seed` + `db:import` from your machine,
then deploy. `vercel.json` already sets up the cron jobs and security headers.

---

## Scheduled maintenance

Point any scheduler at these, with `Authorization: Bearer $CRON_SECRET`:

| Job | Suggested cadence | What it does |
|---|---|---|
| `POST /api/cron/sweep-invites` | daily | Clears invite tokens that lapsed without being accepted, so the team page stops showing a "pending invite" that can never work, and no credential-shaped value lingers on the row |
| `POST /api/cron/prune-activity` | monthly | Trims the audit trail — 180 days for routine edits, 730 for deletions and imports |

Both are recorded in the activity log. If `CRON_SECRET` is unset or shorter
than 16 characters every job answers `404`, so an unconfigured deployment is
never left open.

---

## Layout

```
src/
├── app/
│   ├── login/                  sign-in
│   ├── app/                    agency console
│   │   ├── page.tsx            all projects + agency rollup
│   │   ├── inbox/              messages across projects
│   │   ├── team/               accounts and access (admin)
│   │   └── projects/[id]/      overview · rankings · keywords · backlinks
│   │                           on-page · analytics · tasks · team
│   │                           messages · import · settings
│   ├── portal/                 client portal (mirrors the above, read-only)
│   └── api/                    health · CSV export · message polling
├── components/
│   ├── ui/                     clay design system primitives
│   ├── charts/                 Recharts wrappers + KPI tiles
│   ├── tables/                 table shell, filters, sorting, pagination
│   └── layout/                 app shell, sidebar, project switcher
├── db/
│   ├── schema.ts               13 tables
│   └── queries/                every read, one module per domain
├── features/                   one folder per domain: actions + forms + tables
├── lib/                        auth, session, validation, CSV, cache, formatting
└── proxy.ts                    route gate (Next 16's rename of `middleware`)
```

### A note on the design

The UI is a "clay" system: soft matte surfaces, generous radii, and dual shadows
(an ambient drop plus an inner rim highlight) so panels read as pressed clay
rather than glass. Tokens live in `src/app/globals.css` — change
`--color-brand-*` and the whole app follows.

---

## Security notes

- Passwords are bcrypt hashed (cost 11) and never returned by any query.
- Sessions are signed JWTs in an `httpOnly`, `sameSite=lax` cookie. `src/proxy.ts`
  verifies the signature at the edge; `getCurrentUser()` re-checks the account
  against the database on every request, so deactivating an account takes effect
  immediately.
- **Backlink login credentials never reach a client.** Client-facing reads go
  through a projection that nulls those columns
  (`PUBLIC_COLUMNS` in `src/db/queries/backlinks.ts`), and the CSV export drops
  them for non-staff.
- Internal message threads are filtered out of the portal in both the list query
  and the polling endpoint.
- Every mutation re-checks project membership server-side — a client cannot act
  on another project by editing a form field.
