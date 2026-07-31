import { NextResponse } from "next/server";

import { getUnreadCount } from "@/db/queries/projects";
import { getClientProjectId, getCurrentUser } from "@/lib/auth";

/* ════════════════════════════════════════════════════════════════
   Unread count for whoever is signed in.

   The sidebar badge is rendered on the server, so it only ever
   changed when you navigated — a message arriving while you sat on
   the keywords page was invisible until you happened to click
   something. This is polled by the shell so the badge is live
   everywhere, not just inside an open thread.
   ════════════════════════════════════════════════════════════════ */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // A client only ever has the one project; staff see everything they are on.
  const scope =
    user.role === "CLIENT"
      ? [(await getClientProjectId(user.id)) ?? ""].filter(Boolean)
      : user.projectIds;

  const unread = scope.length
    ? await getUnreadCount(user.id, scope, user.role !== "CLIENT")
    : 0;

  return NextResponse.json(
    { unread },
    { headers: { "Cache-Control": "no-store" } },
  );
}
