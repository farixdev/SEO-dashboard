import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/misc";
import { getThread, listMessages, listThreads } from "@/db/queries/messages";
import { MessageThread } from "@/features/messages/message-thread";
import { ThreadList, ThreadPlaceholder } from "@/features/messages/thread-list";
import { HELP } from "@/lib/help";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread: threadParam } = await searchParams;
  const user = await requireStaff();

  const threads = await listThreads(user.id, {
    projectIds: user.projectIds,
    includeInternal: true,
  });

  const activeId =
    threadParam && threads.some((t) => t.id === threadParam)
      ? threadParam
      : threads[0]?.id;

  const [active, messages] = activeId
    ? await Promise.all([getThread(activeId), listMessages(activeId)])
    : [null, []];

  const unread = threads.reduce((acc, t) => acc + t.unread, 0);

  return (
    <>
      <PageHeader
          help={HELP.messages}
        title="Inbox"
        description={
          unread > 0
            ? `${unread} unread message${unread === 1 ? "" : "s"} across your projects.`
            : "Every conversation across your projects, newest first."
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <ThreadList
          threads={threads.map((t) => ({
            ...t,
            lastMessageAt: t.lastMessageAt.toISOString(),
          }))}
          activeId={activeId}
          basePath="/app/inbox"
          projectId={null}
          canStartInternal
          showProjectName
          canDelete
        />

        {active ? (
          <MessageThread
            /*
             * Keyed on the thread so switching conversations remounts the
             * composer. Without it the same instance is reused and a
             * half-typed reply follows you into the next conversation — which
             * with client-visible threads is a real way to send the wrong
             * person the wrong message.
             */
            key={active.id}
            threadId={active.id}
            subject={
              active.projectName ? `${active.subject} · ${active.projectName}` : active.subject
            }
            status={active.status}
            isInternal={active.isInternal}
            currentUserId={user.id}
            currentUserRole={user.role}
            initialMessages={messages.map((m) => ({
              ...m,
              createdAt: m.createdAt.toISOString(),
              editedAt: m.editedAt?.toISOString() ?? null,
            }))}
          />
        ) : (
          <ThreadPlaceholder />
        )}
      </div>
    </>
  );
}
