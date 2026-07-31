# Deploying to Vercel + Neon

Start to finish, from an empty Neon account to a live URL your client can sign
into. Roughly 20 minutes, most of it waiting for builds.

The app is built for this pair specifically: it talks to Postgres over Neon's
**HTTP** driver (`drizzle-orm/neon-http`), which is what works inside a
serverless function. Only the local scripts use the pooled TCP driver.

---

## 1. Create the Neon database

1. Sign up at [console.neon.tech](https://console.neon.tech) and create a
   project. Pick the region closest to your Vercel region — every query is a
   round trip, and cross-continent adds ~200ms to each one.
2. Open **Connect** and copy the **Pooled connection** string. It has
   `-pooler` in the host:

   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   ```

   Use the pooled one. The direct endpoint runs out of connections under
   serverless load.

> **Free tier note.** Neon suspends an idle database after 5 minutes. The first
> request after that pays a cold start of a second or two. If the client is
> going to be in and out all day, the paid tier's always-on compute is worth it.

---

## 2. Prepare the schema and the first accounts

These are one-off, run from your machine against the same database. Put the
connection string in `.env.local` first:

```bash
npm install
npm run db:migrate
npm run db:seed
```

`db:seed` prints the admin credentials. It also creates the six specialist
accounts named in the workbook so imported backlinks attach to real people.

Then load the spreadsheet:

```bash
npm run db:import -- --file "C:/Users/User/Downloads/Mindcob New SEO Dashboard.xlsx"
```

Check it landed correctly before you go any further:

```bash
npm run db:parity
```

That should say **16,855 checks, 0 mismatches**. It compares the database
against the workbook cell by cell, reading the sheet independently of the
importer.

---

## 3. Push to GitHub and import on Vercel

1. Push the repo.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import it.
3. Leave the framework preset, build command and output directory alone —
   Next.js is detected. Do **not** set a custom install or build command.

Do not deploy yet. Set the environment variables first, or the build will fail
on the missing `AUTH_SECRET`.

---

## 4. Environment variables

Project → **Settings → Environment Variables**. Add each to **Production**,
**Preview** and **Development** unless noted.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | **yes** | The Neon **pooled** string from step 1 |
| `AUTH_SECRET` | **yes** | 32+ random characters — see below |
| `NEXT_PUBLIC_APP_URL` | strongly recommended | `https://your-domain.com`. Production only |
| `CRON_SECRET` | for scheduled jobs | 16+ random characters |
| `SESSION_MAX_AGE_DAYS` | no | Defaults to `14` |

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice — `AUTH_SECRET` and `CRON_SECRET` must not be the same value.

**What each one does:**

- **`AUTH_SECRET`** signs the session cookie (HS256). Changing it later signs
  everyone out immediately. It is validated at startup and the app refuses to
  run if it is missing or under 24 characters, so a typo fails loudly rather
  than silently accepting forged cookies.
- **`NEXT_PUBLIC_APP_URL`** is the base for invite links. If you leave it unset
  the app falls back to Vercel's own deployment URL rather than `localhost`, so
  links still work — but they will point at the ugly `*.vercel.app` host and
  will change on every deployment. Set it once you have a domain.
- **`CRON_SECRET`** gates `/api/cron/*`. Vercel sends it automatically as
  `Authorization: Bearer …` once the variable exists. **If it is unset, every
  job returns 404** — deliberately, so an unconfigured deployment is never left
  open to the internet.

`SEED_ADMIN_*` are only read by `npm run db:seed` on your machine. They are
never read at runtime and do not belong in Vercel.

---

## 5. Deploy

Hit **Deploy**. The build runs `next build`, which does not touch the database —
no query runs at build time, so a missing `DATABASE_URL` fails at request time,
not during the build.

`vercel.json` is already in the repo and configures:

- **Cron jobs** — invite sweep daily at 03:00 UTC, activity-log prune monthly.
  Vercel Cron issues a **GET**; the route handles GET and POST.
- **Security headers** — HSTS, `X-Frame-Options: DENY`, `nosniff`, a restrictive
  `Permissions-Policy`.
- **`Cache-Control: no-store` on `/api/*`** so no proxy ever caches a
  per-user response.

Cron jobs run on production deployments only, and the Hobby plan allows two
per day — which is exactly what is configured.

---

## 6. First sign-in

Go to `https://your-app.vercel.app/login` and sign in with the credentials
`db:seed` printed.

You will land on **Choose a password** immediately. That is intended: the seeded
password is a setup default, and the account is flagged `must_change_password`,
so the console stays shut until you set a real one. The same applies to every
account an admin creates.

---

## 7. Give the client access

**People & access → Send invite**, or a project's **Settings → Who can access
this project**. That produces a one-time link:

```
https://your-domain.com/invite/<token>
```

Send it however you like. The client chooses their own password and lands on
their dashboard. The link lasts 7 days, works once, can be revoked, and is
stored only as a SHA-256 hash — you never handle their password.

This is why `NEXT_PUBLIC_APP_URL` matters: get it wrong and you send the client
a link to the wrong host.

---

## 8. Custom domain

Project → **Settings → Domains** → add it and follow the DNS instructions.
Afterwards, update `NEXT_PUBLIC_APP_URL` to the new domain and redeploy, or
invite links will keep pointing at the old host.

---

## Verifying a live deployment

Every check can be pointed at the deployed URL:

```bash
npm run db:parity                                  # workbook vs database
npm run verify:invite -- https://your-domain.com   # the client invite flow
npm run verify:gate   -- https://your-domain.com   # forced password change
npm run verify:cache  -- https://your-domain.com   # freshness + no credential leak
npm run verify:chat   -- https://your-domain.com   # messaging + notifications
```

They create and delete their own throwaway accounts, so they are safe to run
against production — but they do write, so prefer a preview deployment if you
would rather not touch live data.

Also check the health endpoint, which is intentionally unauthenticated:

```bash
curl https://your-domain.com/api/health
```

---

## Updating later

Push to the default branch; Vercel rebuilds. If a change touches
`src/db/schema.ts`, generate and apply the migration first:

```bash
npm run db:generate     # writes SQL into drizzle/
npm run db:migrate      # applies it to Neon
```

Apply the migration **before** the deploy that needs it, so the old code never
meets the new schema.

When the client sends an updated workbook:

```bash
npm run db:sync                 # dry run — shows what would be added
npm run db:sync -- --apply
```

That is additive and idempotent. It never deletes, so anything the team edited
in the app since the last import survives.

---

## Troubleshooting

**Build fails: `AUTH_SECRET is missing or too short`** — the variable is not set
for the environment being built. Preview deployments need their own copy.

**Every page 500s, health check says the database is unreachable** — the Neon
project is suspended or the connection string is the direct endpoint. Use the
pooled one.

**Invite links point at `localhost`** — `NEXT_PUBLIC_APP_URL` is unset locally.
On Vercel it falls back to the deployment URL, so this only bites when links are
generated from a dev machine.

**Cron jobs never run** — `CRON_SECRET` is unset, so the route returns 404 by
design. Set it and redeploy. Cron does not run on preview deployments.

**Everything is slow (1s+ per page)** — the Neon region and the Vercel region
are far apart. Both are set at creation time; moving the Vercel function region
to match Neon is the fix.

**Signed out unexpectedly after a deploy** — `AUTH_SECRET` changed. Every
existing cookie was signed with the old value.
