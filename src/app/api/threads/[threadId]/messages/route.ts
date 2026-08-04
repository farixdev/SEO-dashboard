import { NextResponse } from "next/server";

import { getThread, listMessages } from "@/db/queries/messages";
import { getCurrentUser } from "@/lib/auth";

/** Polled by the message composer every few seconds. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const thread = await getThread(threadId, user.id);
  if (!thread || !user.projectIds.includes(thread.projectId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Internal threads are invisible to clients, even by direct id.
  if (thread.isInternal && user.role === "CLIENT") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await listMessages(threadId);

  return NextResponse.json(
    { messages },
    { headers: { "Cache-Control": "no-store" } },
  );
}
