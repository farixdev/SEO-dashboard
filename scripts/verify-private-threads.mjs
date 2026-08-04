/**
 * A conversation addressed to specific people must be invisible to everyone
 * else — through EVERY read path, not just the one the UI happens to use.
 *
 * The list, the single thread, the polling endpoint and the unread badge are
 * four separate queries. Miss one and a private thread leaks, so each is
 * checked independently here.
 *
 * `npm run verify:threads -- http://localhost:3000` (needs a running server).
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

let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${extra}`);
};

const PASSWORD = "ThreadProbe12345";
const [project] = await sql`select id from projects limit 1`;
await sql`delete from users where email like 'tp.%@example.test'`;
const hash = await bcrypt.hash(PASSWORD, 11);

const make = async (slug, role, memberRole) => {
  const [u] = await sql`insert into users (email,name,password_hash,role,must_change_password)
    values (${`tp.${slug}@example.test`}, ${slug}, ${hash}, ${role}, false) returning id`;
  await sql`insert into project_members (project_id,user_id,role)
    values (${project.id}, ${u.id}, ${memberRole}) on conflict do nothing`;
  return u.id;
};
const admin = await make("admin", "ADMIN", "OWNER");
const alice = await make("alice", "SPECIALIST", "SPECIALIST");
await make("bob", "SPECIALIST", "SPECIALIST");
await make("client", "CLIENT", "CLIENT_VIEWER");

const signIn = async (slug) => {
  const html = await (await fetch(`${BASE}/login`)).text();
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (m[0].match(/name="([^"]*)"/) || [])[1];
    if (!n) continue;
    fd.set(n, ((m[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  fd.set("email", `tp.${slug}@example.test`);
  fd.set("password", PASSWORD);
  const r = await fetch(`${BASE}/login`, { method: "POST", body: fd, redirect: "manual" });
  return "seo_session=" + (r.headers.get("set-cookie") || "").match(/seo_session=([^;]+)/)[1];
};

const cookies = {
  admin: await signIn("admin"),
  alice: await signIn("alice"),
  bob: await signIn("bob"),
  client: await signIn("client"),
};

/* A private conversation: admin -> alice only. */
const SECRET = "ZZ-PRIVATE-TO-ALICE";
const [priv] = await sql`insert into threads (project_id, subject, created_by_id, is_internal)
  values (${project.id}, 'Private to Alice', ${admin}, true) returning id`;
await sql`insert into thread_participants (thread_id, user_id)
  values (${priv.id}, ${admin}), (${priv.id}, ${alice})`;
await sql`insert into messages (thread_id, author_id, body)
  values (${priv.id}, ${admin}, ${SECRET})`;

/* An ordinary project-wide thread, to prove nothing else regressed. */
const OPEN_BODY = "ZZ-EVERYONE-CAN-SEE";
const [openThread] = await sql`insert into threads (project_id, subject, created_by_id, is_internal)
  values (${project.id}, 'Everyone', ${admin}, false) returning id`;
await sql`insert into messages (thread_id, author_id, body)
  values (${openThread.id}, ${admin}, ${OPEN_BODY})`;

const page = async (who, path) =>
  (await fetch(BASE + path, { headers: { cookie: cookies[who] } })).text();
const api = async (who, id) =>
  fetch(`${BASE}/api/threads/${id}/messages`, { headers: { cookie: cookies[who] } });
const unread = async (who) =>
  (await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: cookies[who] } })).json()).unread;

const inbox = `/app/projects/${project.id}/messages`;

console.log("\nA private conversation reaches only the people named");
console.log("-".repeat(78));

const aliceList = await page("alice", inbox);
check(aliceList.includes("Private to Alice"), "the person it is for sees it in the list");
check((await api("alice", priv.id)).status === 200, "…and can read it");

const bobList = await page("bob", inbox);
check(!bobList.includes("Private to Alice"), "another specialist does NOT see it listed");
check(!bobList.includes(SECRET), "…and the body is not in their payload");
check((await api("bob", priv.id)).status === 404, "…and the polling endpoint refuses them");

const clientList = await page("client", "/portal/messages");
check(!clientList.includes("Private to Alice"), "the client does not see it");
check((await api("client", priv.id)).status === 404, "…and is refused by the endpoint");

check(await page("admin", inbox).then((h) => h.includes("Private to Alice")),
  "the author still sees their own thread");

/*
 * The badge is its own query, so it gets its own proof: traffic in a
 * conversation bob cannot open must not nudge him, while traffic in one he
 * can must. Measured as a delta, so whatever else is unread does not matter.
 */
const bobBefore = await unread("bob");
const aliceBefore = await unread("alice");

const newThread = async (subject, isInternal, participants) => {
  const [t] = await sql`insert into threads (project_id, subject, created_by_id, is_internal)
    values (${project.id}, ${subject}, ${admin}, ${isInternal}) returning id`;
  for (const p of participants) {
    await sql`insert into thread_participants (thread_id, user_id) values (${t.id}, ${p})`;
  }
  await sql`insert into messages (thread_id, author_id, body)
    values (${t.id}, ${admin}, ${"body of " + subject})`;
  return t.id;
};

const priv2 = await newThread("Second private", true, [admin, alice]);
check((await unread("bob")) === bobBefore,
  "a private conversation does not raise a bystander's badge", `stayed ${bobBefore}`);
check((await unread("alice")) === aliceBefore + 1,
  "…but it does raise the badge of the person it is for",
  `${aliceBefore} → ${aliceBefore + 1}`);

const open2 = await newThread("Second open", false, []);
check((await unread("bob")) === bobBefore + 1,
  "an open conversation still raises everyone's badge",
  `${bobBefore} → ${bobBefore + 1}`);
await sql`delete from threads where id in (${priv2}, ${open2})`;

/*
 * Composing. The inbox used to offer no way to start anything at all, which
 * is the whole reason participants exist — so check the affordance is there
 * and carries both the projects and the people to address.
 */
const adminInbox = await page("admin", "/app/inbox");
check(/\\"projects\\":\[/.test(adminInbox) || adminInbox.includes('"projects":['),
  "the inbox ships the project list to its compose dialog");
check(adminInbox.includes("alice") && adminInbox.includes("bob"),
  "…with the people a conversation can be addressed to");

const adminProjectPage = await page("admin", inbox);
check(adminProjectPage.includes("alice") && adminProjectPage.includes("bob"),
  "a project's own inbox offers the same names");

/* The ordinary thread must still behave exactly as before. */
check(bobList.includes("Everyone"), "a project-wide thread is still visible to all staff");
check((await api("bob", openThread.id)).status === 200, "…and readable");
check((await page("client", "/portal/messages")).includes("Everyone"),
  "…and still reaches the client");

await sql`delete from threads where id in (${priv.id}, ${openThread.id})`;
await sql`delete from users where email like 'tp.%@example.test'`;

console.log("-".repeat(78));
console.log(failures ? `\n  ${failures} check(s) failed.\n` : "\n  Private conversations verified on every read path.\n");
process.exit(failures === 0 ? 0 : 1);
