import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const sql = neon(env.DATABASE_URL);

const formOf = html => { const fd=new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n=(m[0].match(/name="([^"]*)"/)||[])[1]; if(!n) continue;
    fd.set(n, ((m[0].match(/value="([^"]*)"/)||[])[1]??"").replace(/&quot;/g,'"').replace(/&amp;/g,"&"));
  } return fd; };
let fail=0; const ck=(ok,l,x="")=>{ if(!ok) fail++; console.log(`  ${ok?"PASS":"FAIL"}  ${l.padEnd(50)} ${x}`); };
const cookieOf = r => { const m=(r.headers.get("set-cookie")||"").match(/seo_session=([^;]+)/); return m?`seo_session=${m[1]}`:null; };
const login = async (email,password) => { const fd=formOf(await (await fetch(`${BASE}/login`)).text());
  fd.set("email",email); fd.set("password",password);
  return fetch(`${BASE}/login`,{method:"POST",body:fd,redirect:"manual"}); };

await sql`delete from users where email='staffgate@example.test'`;
await sql`insert into users (email,name,password_hash,role,must_change_password)
  values ('staffgate@example.test','Staff Gate',${await bcrypt.hash("Admin@12345",11)},'ADMIN',true)`;

console.log("\nStaff forced-password flow");
console.log("-".repeat(72));

const r1 = await login("staffgate@example.test","Admin@12345");
const cookie = cookieOf(r1);
ck(!!cookie, "signs in with the seeded password", `status ${r1.status}`);

const app = await fetch(`${BASE}/app`,{headers:{cookie},redirect:"manual"});
const b1 = await app.text();
ck(app.status===307 && (app.headers.get("location")||"").includes("/set-password"),
   "console is closed until a password is chosen", `${app.status} -> ${app.headers.get("location")||"-"}`);
ck(!/Mindcob|1,767/.test(b1), "no project data in the blocked response", `${b1.length} bytes`);

const f2 = formOf(await (await fetch(`${BASE}/set-password`,{headers:{cookie}})).text());
f2.set("password","ChosenByStaff77"); f2.set("confirmPassword","ChosenByStaff77");
const set = await fetch(`${BASE}/set-password`,{method:"POST",body:f2,headers:{cookie},redirect:"manual"});
ck(set.status<500, "set-password submits without erroring", `status ${set.status}`);
const cookie2 = cookieOf(set);
ck(!!cookie2, "session cookie is re-issued with the cleared flag");

const [after] = await sql`select must_change_password from users where email='staffgate@example.test'`;
ck(after.must_change_password===false, "must-change flag cleared in the database");

const app2 = await fetch(`${BASE}/app`,{headers:{cookie:cookie2??cookie},redirect:"manual"});
const b2 = await app2.text();
ck(app2.status===200 && /Mindcob/.test(b2), "console opens straight away, no redirect loop", `status ${app2.status}`);

ck(!cookieOf(await login("staffgate@example.test","Admin@12345")), "the old seeded password no longer works");
ck(!!cookieOf(await login("staffgate@example.test","ChosenByStaff77")), "the newly chosen password works");

await sql`delete from users where email='staffgate@example.test'`;
console.log("-".repeat(72));
console.log(fail ? `\n  ${fail} failed\n` : "\n  All staff-gate checks passed.\n");
process.exit(fail?1:0);
