/**
 * Exercises the client invite flow the way a real admin and client would.
 *   issue -> open link -> set password -> land on portal -> link is dead
 * Also checks the forced password screen actually blocks the dashboard.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://localhost:3100";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const sql = neon(env.DATABASE_URL);
const [project] = await sql`select id, name from projects limit 1`;

const say = (ok, label, extra = "") =>
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${extra}`);
let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  say(ok, label, extra);
};

/* ── a throwaway client, created the way the admin UI does ── */
// Left over from an interrupted run — start clean.
await sql`delete from users where email='invite.probe@example.test'`;
const [client] = await sql`
  insert into users (email, name, password_hash, role, must_change_password)
  values ('invite.probe@example.test', 'Invite Probe', 'x', 'CLIENT', true)
  returning id, email, name`;
await sql`insert into project_members (project_id, user_id, role)
          values (${project.id}, ${client.id}, 'CLIENT_VIEWER') on conflict do nothing`;

console.log(`\nInvite flow  (${client.email})`);
console.log("-".repeat(74));

/* ── 1. admin issues an invite (simulate the action's DB effect) ── */
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const expires = new Date(Date.now() + 7 * 86400000);
await sql`update users set invite_token_hash=${hash}, invite_expires_at=${expires},
          invite_accepted_at=null where id=${client.id}`;

const url = `${BASE}/invite/${token}`;

/* ── 2. the link opens without any session ── */
let res = await fetch(url, { redirect: "manual" });
let html = await res.text();
let text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
check(res.status === 200, "invite link opens for a signed-out visitor", `status ${res.status}`);
check(text.includes("Invite Probe".split(" ")[0]), "greets them by name");
check(text.includes(client.email), "shows the sign-in email");
check(text.includes(project.name) || text.includes("dashboard"), "names what they get access to");

/* ── 3. a bogus token is refused ── */
res = await fetch(`${BASE}/invite/${randomBytes(32).toString("base64url")}`, { redirect: "manual" });
text = (await res.text()).replace(/<[^>]+>/g, " ");
check(text.includes("no longer works") || text.includes("not valid"), "unknown token is rejected");

/* ── 4. an expired invite is refused ── */
await sql`update users set invite_expires_at=${new Date(Date.now() - 1000)} where id=${client.id}`;
text = (await (await fetch(url, { redirect: "manual" })).text()).replace(/<[^>]+>/g, " ");
check(text.includes("expired"), "expired invite is rejected");
await sql`update users set invite_expires_at=${expires} where id=${client.id}`;

/* ── 5. redeem it through the real Server Action ── */
/*
 * React 19 sends a `useActionState` submit as multipart with the bound
 * previous state carried in hidden `$ACTION_*` fields. Those are rendered
 * into the HTML for progressive enhancement, so replaying them is exactly
 * what the browser does — no hand-rolled action id needed.
 */
const page = await (await fetch(url)).text();
const hidden = [...page.matchAll(/<input[^>]*type="hidden"[^>]*>/g)]
  .map((m) => m[0])
  .map((tag) => ({
    name: (tag.match(/name="([^"]*)"/) ?? [])[1],
    value: (tag.match(/value="([^"]*)"/) ?? [])[1] ?? "",
  }))
  .filter((f) => f.name);

check(
  hidden.some((f) => f.name.startsWith("$ACTION_")),
  "invite form carries its Server Action reference",
  `${hidden.length} hidden fields`,
);

const form = new FormData();
for (const f of hidden) {
  form.set(f.name, f.value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}
form.set("token", token);
form.set("password", "ClientChosen99");
form.set("confirmPassword", "ClientChosen99");

const submit = await fetch(url, { method: "POST", body: form, redirect: "manual" });
const [row] = await sql`select invite_accepted_at, must_change_password, password_hash
                        from users where id=${client.id}`;

check(Boolean(row.invite_accepted_at), "password set through the invite action", `status ${submit.status}`);
check(row.must_change_password === false, "must-change flag cleared");
check(row.password_hash.startsWith("$2"), "password stored as a bcrypt hash");

const setCookie = submit.headers.get("set-cookie") ?? "";
const m = setCookie.match(/seo_session=([^;]+)/);
const sessionCookie = m ? `seo_session=${m[1]}` : null;
check(Boolean(m), "signed in automatically (session cookie issued)");

/* ── 6. the token is now dead ── */
text = (await (await fetch(url, { redirect: "manual" })).text()).replace(/<[^>]+>/g, " ");
check(text.includes("already been used"), "link cannot be reused");

/* ── 8. the session lands on a working portal ── */
if (sessionCookie) {
  const portal = await fetch(`${BASE}/portal`, { headers: { cookie: sessionCookie }, cache: "no-store" });
  const body = (await portal.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check(portal.status === 200, "session reaches the portal", `status ${portal.status}`);
  check(!body.includes("Something went wrong"), "portal renders without an error boundary");
}

/* ── 9. a temp password blocks the dashboard ── */
await sql`update users set must_change_password=true where id=${client.id}`;

const cookieFor = async (claims) =>
  "seo_session=" +
  (await new SignJWT({
    email: client.email,
    name: client.name,
    role: "CLIENT",
    projectId: project.id,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .setSubject(client.id)
    .sign(new TextEncoder().encode(env.AUTH_SECRET)));

// The normal case: the cookie was issued after the flag was set, so the
// proxy turns it away at the edge before anything renders.
const fresh = await fetch(`${BASE}/portal`, {
  headers: { cookie: await cookieFor({ mustChangePassword: true }) },
  redirect: "manual",
});
check(
  fresh.status === 307 && (fresh.headers.get("location") ?? "").includes("/set-password"),
  "temp password blocks the portal at the edge",
  `${fresh.status} -> ${fresh.headers.get("location") ?? "-"}`,
);

// The awkward case: an admin set the flag on a session that was already
// open, so the cookie predates it. The proxy cannot know, so the server
// guards have to catch it — and must not stream any data while doing so.
const staleCookie = await cookieFor({});
const stale = await fetch(`${BASE}/portal`, { headers: { cookie: staleCookie } });
const staleBody = await stale.text();
check(
  !/Average position|Seen in search/.test(staleBody) && !staleBody.includes(project.name),
  "a cookie predating the flag still gets no project data",
  `${staleBody.length} bytes`,
);
check(
  staleBody.includes("set-password"),
  "…and is sent to the password screen",
);

const setPw = await fetch(`${BASE}/set-password`, {
  headers: { cookie: staleCookie },
  cache: "no-store",
});
check(setPw.status === 200, "set-password screen is reachable", `status ${setPw.status}`);


/* ── 10. the issuer chooses how long the link lives ── */
{
  const { createHash, randomBytes } = await import("node:crypto");
  const reissue = async (expiresAt) => {
    const t = randomBytes(32).toString("base64url");
    await sql`update users set invite_token_hash=${createHash("sha256").update(t).digest("hex")},
      invite_expires_at=${expiresAt}, invite_accepted_at=null where id=${client.id}`;
    return t;
  };
  const read = async (t) =>
    (await (await fetch(`${BASE}/invite/${t}`)).text()).replace(/<[^>]+>/g, " ");

  check(!/expired/i.test(await read(await reissue(null))),
    "a never-expiring link opens");
  check(!/expired/i.test(await read(await reissue(new Date(Date.now() + 180 * 86400000)))),
    "a 6-month link opens");
  check(/expired/i.test(await read(await reissue(new Date(Date.now() - 1000)))),
    "a lapsed link is still refused");

  // The nightly sweep must not treat "never" as "long overdue".
  await reissue(null);
  await fetch(`${BASE}/api/cron/sweep-invites`, {
    method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const [kept] = await sql`select invite_token_hash from users where id=${client.id}`;
  check(kept.invite_token_hash !== null, "the sweep leaves a never-expiring invite alone");
}

/* ── clean up ── */
await sql`delete from users where id=${client.id}`;
console.log("-".repeat(74));
console.log(failures === 0 ? "\n  All invite checks passed.\n" : `\n  ${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
