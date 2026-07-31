/**
 * Messaging and notifications, end to end.
 *
 * Needs a running server: `npm run build && npm start`, then
 * `npm run verify:chat -- http://localhost:3000`.
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
const hidden = (html) => {
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (m[0].match(/name="([^"]*)"/) || [])[1];
    if (!n) continue;
    fd.set(n, ((m[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  return fd;
};
let fail = 0;
const ck = (ok, label, extra = "") => { if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${extra}`); };

const PASSWORD = "ChatProbe12345";
const [project] = await sql`select id from projects limit 1`;
await sql`delete from users where email like 'chatprobe.%@example.test'`;
const hash = await bcrypt.hash(PASSWORD, 11);
const [staff] = await sql`insert into users (email,name,password_hash,role,must_change_password)
  values ('chatprobe.staff@example.test','Chat Probe Staff',${hash},'ADMIN',false) returning id`;
const [client] = await sql`insert into users (email,name,password_hash,role,must_change_password)
  values ('chatprobe.client@example.test','Chat Probe Client',${hash},'CLIENT',false) returning id`;
await sql`insert into project_members (project_id,user_id,role) values (${project.id},${client.id},'CLIENT_VIEWER')`;
await sql`insert into project_members (project_id,user_id,role) values (${project.id},${staff.id},'OWNER') on conflict do nothing`;

const signIn = async (email) => {
  const fd = hidden(await (await fetch(`${BASE}/login`)).text());
  fd.set("email", email); fd.set("password", PASSWORD);
  const r = await fetch(`${BASE}/login`, { method: "POST", body: fd, redirect: "manual" });
  return "seo_session=" + (r.headers.get("set-cookie") || "").match(/seo_session=([^;]+)/)[1];
};
const staffCookie = await signIn("chatprobe.staff@example.test");
const clientCookie = await signIn("chatprobe.client@example.test");

console.log("\nMessaging and notifications");
console.log("-".repeat(78));

const [thread] = await sql`insert into threads (project_id, subject, created_by_id, is_internal)
  values (${project.id}, 'Chat probe thread', ${staff.id}, false) returning id`;
await sql`insert into messages (thread_id, author_id, body)
  values (${thread.id}, ${staff.id}, 'Hello from the agency')`;

const feed = await fetch(`${BASE}/api/threads/${thread.id}/messages`, { headers: { cookie: clientCookie } });
const body = await feed.json();
ck(feed.status === 200, "client can poll the thread", `status ${feed.status}`);
ck(body.messages?.some((m) => m.body === "Hello from the agency"), "the message is in the feed");

const n1 = await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: clientCookie } })).json();
ck(typeof n1.unread === "number", "notifications endpoint responds", `unread=${n1.unread}`);
ck(n1.unread > 0, "the new message counts as unread");

const [internal] = await sql`insert into threads (project_id, subject, created_by_id, is_internal)
  values (${project.id}, 'Internal only', ${staff.id}, true) returning id`;
await sql`insert into messages (thread_id, author_id, body)
  values (${internal.id}, ${staff.id}, 'ZZ-INTERNAL-ONLY')`;

const blocked = await fetch(`${BASE}/api/threads/${internal.id}/messages`, { headers: { cookie: clientCookie } });
ck(blocked.status === 404, "internal thread is 404 for a client", `status ${blocked.status}`);

const n2 = await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: clientCookie } })).json();
ck(n2.unread === n1.unread,
  "internal threads do not inflate the client badge", `${n1.unread} -> ${n2.unread}`);

// Staff authored everything so far, and you never have unread messages from
// yourself — so the client has to say something for staff's count to move.
const nsBefore = await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: staffCookie } })).json();
await sql`insert into messages (thread_id, author_id, body)
  values (${thread.id}, ${client.id}, 'Thanks, looks good')`;
const nsAfter = await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: staffCookie } })).json();
ck(nsAfter.unread > nsBefore.unread,
  "a client reply raises the staff badge", `${nsBefore.unread} -> ${nsAfter.unread}`);

// And the reverse: your own message never counts against you.
const selfCount = await (await fetch(`${BASE}/api/notifications`, { headers: { cookie: clientCookie } })).json();
ck(selfCount.unread === n2.unread,
  "your own message does not count as unread for you", `still ${selfCount.unread}`);

ck((await fetch(`${BASE}/api/notifications`)).status === 401, "a session is required");

await sql`delete from threads where id in (${thread.id}, ${internal.id})`;
await sql`delete from users where email like 'chatprobe.%@example.test'`;
console.log("-".repeat(78));
console.log(fail ? `\n  ${fail} check(s) failed.\n` : "\n  Chat and notifications verified.\n");
process.exit(fail === 0 ? 0 : 1);
