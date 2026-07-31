import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";

/** Liveness + database reachability, for uptime checks and setup debugging. */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        hint: process.env.DATABASE_URL
          ? "DATABASE_URL is set but the connection failed. Check the string and that the Neon project is not suspended."
          : "DATABASE_URL is not set. Add it to .env.local and run `npm run setup`.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
