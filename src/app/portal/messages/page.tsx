import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/misc";
import { getThread, listMessages, listThreads } from "@/db/queries/messages";
import { MessageThread } from "@/features/messages/message-thread";
import { ThreadList, ThreadPlaceholder } from "@/features/messages/thread-list";
import { requirePortalProject } from "@/lib/portal";

export const metadata: Metadata = { title: "Messages" };

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread: threadParam } = await searchParams;
  const { user, projectId } = await requirePortalProject();

  // includeInternal is false — the agency's private threads never appear here.
  const threads = await listThreads(user.id, {
    projectId,
    includeInternal: false,
  });

  const activeId =
    threadParam && threads.some((t) => t.id === threadParam)
      ? threadParam
      : threads[0]?.id;

  const [active, messages] = activeId
    ? await Promise.all([getThread(activeId, user.id), listMessages(activeId)])
    : [null, []];

  return (
    <>
      <PageHeader
        title="Messages"
        description="Ask questions, share feedback, or request changes — your SEO team is notified here."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <ThreadList
          threads={threads.map((t) => ({
            ...t,
            lastMessageAt: t.lastMessageAt.toISOString(),
          }))}
          activeId={activeId}
          basePath="/portal/messages"
          projectId={projectId}
          canStartInternal={false}
          canDelete={false}
        />

        {active && !active.isInternal ? (
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
            subject={active.subject}
            status={active.status}
            isInternal={false}
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
