import { PageHeader } from "@/components/ui/misc";
import { getThread, listMessages, listThreads } from "@/db/queries/messages";
import { getProjectMembers } from "@/db/queries/projects";
import { MessageThread } from "@/features/messages/message-thread";
import { ThreadList, ThreadPlaceholder } from "@/features/messages/thread-list";
import { HELP } from "@/lib/help";
import { requireProjectAccess } from "@/lib/auth";

export default async function ProjectMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const { id } = await params;
  const { thread: threadParam } = await searchParams;
  const { user } = await requireProjectAccess(id);

  const threads = await listThreads(user.id, {
    projectId: id,
    includeInternal: true,
  });

  const activeId =
    threadParam && threads.some((t) => t.id === threadParam)
      ? threadParam
      : threads[0]?.id;

  const [[active, messages], members] = await Promise.all([
    activeId
      ? Promise.all([getThread(activeId, user.id), listMessages(activeId)])
      : Promise.resolve([null, []] as const),
    getProjectMembers(id),
  ]);

  return (
    <>
      <PageHeader
          help={HELP.messages}
        title="Messages"
        description="Talk to the client, or keep notes in an internal thread they cannot see."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <ThreadList
          // Everyone on the project, so a conversation can be addressed to
          // one specialist, or to the client alone.
          people={members
            .filter((m) => m.isActive && m.userId !== user.id)
            .map((m) => ({
              id: m.userId,
              name: m.name,
              isClient: m.memberRole === "CLIENT_VIEWER",
            }))}
          threads={threads.map((t) => ({
            ...t,
            lastMessageAt: t.lastMessageAt.toISOString(),
          }))}
          activeId={activeId}
          basePath={`/app/projects/${id}/messages`}
          projectId={id}
          canStartInternal
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
            subject={active.subject}
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
