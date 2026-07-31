import "./load-env";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

import { connect, schema } from "./db";

/**
 * Creates the first admin account and the SEO specialists named in the source
 * workbook. Safe to re-run — every insert is upserted on email.
 */

const SPECIALISTS = [
  { name: "Abu Turab", email: "abu.turab@agency.local", color: "indigo" },
  { name: "Waqas Ahmed", email: "waqas.ahmed@agency.local", color: "sky" },
  { name: "Faseeh", email: "faseeh@agency.local", color: "emerald" },
  { name: "Abdur Rehman", email: "abdur.rehman@agency.local", color: "amber" },
  { name: "Kamran", email: "kamran@agency.local", color: "violet" },
  { name: "Sanan", email: "sanan@agency.local", color: "teal" },
];

const DEFAULT_SPECIALIST_PASSWORD = "Changeme@123";

async function main() {
  const { db, pool } = connect();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@mindcob.com").trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";
  const adminName = process.env.SEED_ADMIN_NAME ?? "SEO Admin";

  console.log("\nSeeding accounts …\n");

  // ── Admin ──
  const [existingAdmin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(sql`lower(${schema.users.email})`, adminEmail.toLowerCase()))
    .limit(1);

  if (existingAdmin) {
    console.log(`  · admin already exists (${adminEmail}) — left untouched`);
  } else {
    await db.insert(schema.users).values({
      email: adminEmail,
      name: adminName,
      passwordHash: await bcrypt.hash(adminPassword, 11),
      role: "ADMIN",
      title: "Administrator",
      avatarColor: "indigo",
      mustChangePassword: true,
    });
    console.log(`  ✓ admin created`);
    console.log(`      email:    ${adminEmail}`);
    console.log(`      password: ${adminPassword}`);
  }

  // ── Specialists from the workbook's "Expert Name" column ──
  const specialistHash = await bcrypt.hash(DEFAULT_SPECIALIST_PASSWORD, 11);
  let created = 0;

  for (const person of SPECIALISTS) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(sql`lower(${schema.users.email})`, person.email))
      .limit(1);
    if (existing) continue;

    await db.insert(schema.users).values({
      email: person.email,
      name: person.name,
      passwordHash: specialistHash,
      role: "SPECIALIST",
      title: "SEO specialist",
      avatarColor: person.color,
      mustChangePassword: true,
    });
    created++;
  }

  if (created) {
    console.log(`\n  ✓ ${created} specialist account${created === 1 ? "" : "s"} created`);
    console.log(`      password for all: ${DEFAULT_SPECIALIST_PASSWORD}`);
    console.log(
      "      (their names match the workbook, so imported backlinks link up automatically)",
    );
  } else {
    console.log("  · specialist accounts already present");
  }

  console.log("\nDone. Sign in at http://localhost:3000/login\n");
  await pool.end();
}

main().catch((error) => {
  console.error("\nSeed failed:", error);
  process.exit(1);
});
