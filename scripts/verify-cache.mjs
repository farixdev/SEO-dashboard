/**
 * Checks the two things caching could plausibly break:
 *
 *   1. Freshness — a cached page must show an edit on the very next load,
 *      not when a TTL happens to lapse.
 *   2. Isolation — `listBacklinks` is cached per projection. Staff pass
 *      `includeSecrets`, the portal does not. If those ever shared a cache
 *      key, a client would be served backlink logins.
 *
 * Needs a running server: `npm run build && npm start`, then
 * `npm run verify:cache -- http://localhost:3000`.
 */
import { readFileSync } from "node:fs";

import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const sql = neon(env.DATABASE_URL);

const hiddenFields = (html) => {
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (m[0].match(/name="([^"]*)"/) || [])[1];
    if (!n) continue;
    fd.set(n, ((m[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  return fd;
};

let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${extra}`);
};

const PASSWORD = "CacheProbe12345";
const [project] = await sql`select id from projects limit 1`;
if (!project) {
  console.error("\n  No project in the database. Run `npm run db:import` first.\n");
  process.exit(1);
}

await sql`delete from users where email like 'cacheprobe.%@example.test'`;
const hash = await bcrypt.hash(PASSWORD, 11);
await sql`insert into users (email, name, password_hash, role, must_change_password)
          values ('cacheprobe.admin@example.test', 'Cache Probe Admin', ${hash}, 'ADMIN', false)`;
const [client] = await sql`insert into users (email, name, password_hash, role, must_change_password)
          values ('cacheprobe.client@example.test', 'Cache Probe Client', ${hash}, 'CLIENT', false)
          returning id`;
await sql`insert into project_members (project_id, user_id, role)
          values (${project.id}, ${client.id}, 'CLIENT_VIEWER')`;

const signIn = async (email) => {
  const fd = hiddenFields(await (await fetch(`${BASE}/login`)).text());
  fd.set("email", email);
  fd.set("password", PASSWORD);
  const res = await fetch(`${BASE}/login`, { method: "POST", body: fd, redirect: "manual" });
  const m = (res.headers.get("set-cookie") ?? "").match(/seo_session=([^;]+)/);
  return m ? `seo_session=${m[1]}` : null;
};

const adminCookie = await signIn("cacheprobe.admin@example.test");
const clientCookie = await signIn("cacheprobe.client@example.test");

/* ── 1. a cached list still reflects an edit at once ─────────────── */

console.log("\nCached reads stay correct");
console.log("-".repeat(76));

/*
 * Unique per run. A fixed title would collide with the cached copy left by the
 * previous run: this script deletes its row with raw SQL, which — correctly —
 * does not invalidate anything, because invalidation is the Server Action's
 * job. Only writes made through the app drop the cache.
 */
const MARK = `Cache Probe Page ${process.pid}-${Math.floor(Math.random() * 1e6)}`;
await sql`delete from pages where project_id=${project.id} and title like 'Cache Probe Page%'`;
const onPage = `${BASE}/app/projects/${project.id}/on-page`;

const timed = async (url, cookie) => {
  const t = Date.now();
  const body = await (await fetch(url, { headers: { cookie } })).text();
  return { body, ms: Date.now() - t };
};

const cold = await timed(onPage, adminCookie);
const warm = await timed(onPage, adminCookie);
check(!cold.body.includes(MARK), "probe row is not there yet");
check(warm.ms < cold.ms, "second load is served from cache", `${cold.ms}ms -> ${warm.ms}ms`);

const importForm = hiddenFields(
  await (await fetch(`${BASE}/app/projects/${project.id}/import`, { headers: { cookie: adminCookie } })).text(),
);
importForm.set("projectId", project.id);
importForm.set("entity", "pages");
importForm.set("content", `Page Title,Target URL,Type,Index\n${MARK},https://example.test/cache,Blog,Y`);
const imported = await fetch(`${BASE}/app/projects/${project.id}/import`, {
  method: "POST", body: importForm, headers: { cookie: adminCookie }, redirect: "manual",
});
check(imported.status < 400, "a write went through the real Server Action", `status ${imported.status}`);

const after = await timed(onPage, adminCookie);
check(after.body.includes(MARK), "the cached page shows it on the very next load", `${after.ms}ms`);
await sql`delete from pages where project_id=${project.id} and title like 'Cache Probe Page%'`;

/* ── 2. staff and client projections never share a cache entry ───── */

console.log("\nStaff credentials never reach the portal through the cache");
console.log("-".repeat(76));

const [target] = await sql`select id, url from backlinks where project_id=${project.id} limit 1`;
const [original] = await sql`select login_user, login_password from backlinks where id=${target.id}`;
const SECRET_USER = "ZZ-CACHE-PROBE-USER";
const SECRET_PASS = "ZZ-CACHE-PROBE-PASS";
await sql`update backlinks set login_user=${SECRET_USER}, login_password=${SECRET_PASS}
          where id=${target.id}`;

// Identical search on both sides, so the only difference is the projection.
const q = encodeURIComponent(target.url.slice(8, 40));

const staffView = await (await fetch(
  `${BASE}/app/projects/${project.id}/backlinks?q=${q}`, { headers: { cookie: adminCookie } })).text();
check(staffView.includes(SECRET_PASS), "staff see it, so the cache is warm WITH secrets");

const portalView = await (await fetch(
  `${BASE}/portal/backlinks?q=${q}`, { headers: { cookie: clientCookie } })).text();
check(!portalView.includes(SECRET_PASS), "portal does not get the password");
check(!portalView.includes(SECRET_USER), "portal does not get the username");

const exported = await (await fetch(
  `${BASE}/api/export/backlinks?projectId=${project.id}`, { headers: { cookie: clientCookie } })).text();
check(!exported.includes(SECRET_PASS) && !exported.includes(SECRET_USER),
  "client CSV export carries neither");

await sql`update backlinks set login_user=${original.login_user},
          login_password=${original.login_password} where id=${target.id}`;
await sql`delete from users where email like 'cacheprobe.%@example.test'`;

console.log("-".repeat(76));
console.log(failures ? `\n  ${failures} check(s) failed.\n` : "\n  Cache is fast, fresh and correctly scoped.\n");
process.exit(failures === 0 ? 0 : 1);
