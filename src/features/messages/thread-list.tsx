"use client";

import { CheckCircle2, Lock, MessageSquarePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { cn, relativeTime, truncate } from "@/lib/utils";

import {
  createThreadAction,
  deleteThreadAction,
  toggleThreadStatusAction,
} from "./actions";

export type ThreadListItem = {
  id: string;
  projectId: string;
  projectName: string | null;
  subject: string;
  status: string;
  isInternal: boolean;
  lastMessageAt: string;
  messageCount: number;
  unread: number;
  lastMessage: string | null;
  lastAuthor: string | null;
  lastAuthorColor: string | null;
};

export type ThreadPerson = { id: string; name: string; isClient: boolean };

/** A project the inbox can start a conversation in, and who is on it. */
export type ThreadProject = { id: string; name: string; people: ThreadPerson[] };

export function ThreadList({
  threads,
  activeId,
  basePath,
  projectId,
  canStartInternal,
  showProjectName = false,
  canDelete,
  people = [],
  projects = [],
}: {
  threads: ThreadListItem[];
  activeId?: string;
  /**
   * Route that owns this list; the thread id is appended as `?thread=`.
   * A plain string rather than a builder function, because a Server Component
   * cannot pass a function across the boundary to a Client Component.
   */
  basePath: string;
  /** null on the cross-project inbox, where a project is chosen in the dialog */
  projectId: string | null;
  canStartInternal: boolean;
  showProjectName?: boolean;
  /** Project members a new conversation can be addressed to. */
  people?: ThreadPerson[];
  /** Only for the cross-project inbox: which projects you may post into. */
  projects?: ThreadProject[];
  canDelete: boolean;
}) {
  const [composing, setComposing] = useState(false);
  const [deleting, setDeleting] = useState<ThreadListItem | null>(null);
  const [, startTransition] = useTransition();

  /*
   * The inbox used to have no way to start anything — you had to remember
   * which project the person was on and navigate there first. Give it the
   * same button, with the project chosen inside the dialog.
   */
  const canCompose = projectId !== null || projects.length > 0;

  return (
    <div className="panel flex max-h-[calc(100dvh-19rem)] min-h-[420px] flex-col overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <h2 className="text-strong text-[13.5px] font-semibold">Conversations</h2>
        {canCompose ? (
          <Button variant="secondary" size="sm" onClick={() => setComposing(true)}>
            <MessageSquarePlus className="size-3.5" />
            New
          </Button>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <li>
            <EmptyState
              title="No conversations yet"
              description={
                canCompose
                  ? "Start a thread to discuss progress, approvals or questions."
                  : "Open a project to start a conversation."
              }
              action={
                canCompose ? (
                  <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
                    <MessageSquarePlus className="size-4" />
                    Start a conversation
                  </Button>
                ) : undefined
              }
            />
          </li>
        ) : (
          threads.map((thread) => (
            <li
              key={thread.id}
              className="border-b last:border-0"
              style={{ borderColor: "var(--line-soft)" }}
            >
              <div
                className={cn(
                  "group relative transition-colors",
                  thread.id === activeId
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--surface-hover)]",
                )}
              >
                <Link
                  href={`${basePath}?thread=${thread.id}`}
                  className="block px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {thread.lastAuthor ? (
                        <Avatar
                          name={thread.lastAuthor}
                          color={thread.lastAuthorColor}
                          size="sm"
                        />
                      ) : (
                        <span className="surface-sunken size-7 shrink-0 rounded-full" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate text-[13px] leading-4",
                            thread.unread > 0
                              ? "text-strong font-semibold"
                              : "text-body font-medium",
                          )}
                        >
                          {thread.subject}
                        </p>
                        {showProjectName && thread.projectName ? (
                          <p className="text-faint truncate text-[11px]">
                            {thread.projectName}
                          </p>
                        ) : null}
                        {thread.lastMessage ? (
                          <p className="text-muted mt-0.5 truncate text-[11.5px]">
                            {thread.lastAuthor ? `${thread.lastAuthor}: ` : ""}
                            {truncate(thread.lastMessage.replace(/\s+/g, " "), 54)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-faint text-[10.5px] whitespace-nowrap">
                        {relativeTime(thread.lastMessageAt)}
                      </span>
                      <div className="flex items-center gap-1">
                        {thread.isInternal ? (
                          <span title="Internal only — not visible to the client">
                            <Lock className="text-faint size-3" />
                          </span>
                        ) : null}
                        {thread.status === "RESOLVED" ? (
                          <CheckCircle2 className="size-3 text-[var(--color-mint-600)]" />
                        ) : null}
                        {thread.unread > 0 ? (
                          <span className="tnum grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--on-accent)]">
                            {thread.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>

                {canDelete ? (
                  <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <form
                      action={(fd) => {
                        startTransition(() => {
                          void toggleThreadStatusAction(fd);
                        });
                      }}
                    >
                      <input type="hidden" name="threadId" value={thread.id} />
                      <button
                        type="submit"
                        title={
                          thread.status === "OPEN"
                            ? "Mark resolved"
                            : "Reopen conversation"
                        }
                        className="text-faint hover:text-strong surface-raised rounded-md p-1 shadow-[var(--elev-1)]"
                      >
                        <CheckCircle2 className="size-3" />
                      </button>
                    </form>
                    <button
                      onClick={() => setDeleting(thread)}
                      title="Delete conversation"
                      className="text-faint hover:text-[var(--color-rose-600)] surface-raised rounded-md p-1 shadow-[var(--elev-1)]"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>

      {canCompose ? (
        <NewThreadDialog
          open={composing}
          onClose={() => setComposing(false)}
          projectId={projectId}
          projects={projects}
          canStartInternal={canStartInternal}
          people={people}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this conversation?"
        description={
          deleting
            ? `“${deleting.subject}” and all ${deleting.messageCount} message${deleting.messageCount === 1 ? "" : "s"} will be permanently removed.`
            : null
        }
        confirmLabel="Delete conversation"
        onConfirm={() => {
          if (!deleting) return;
          const fd = new FormData();
          fd.set("threadId", deleting.id);
          startTransition(async () => {
            await deleteThreadAction(fd);
            setDeleting(null);
          });
        }}
      />
    </div>
  );
}

function NewThreadDialog({
  open,
  onClose,
  projectId,
  projects,
  canStartInternal,
  people,
}: {
  open: boolean;
  onClose: () => void;
  /** null on the inbox: the project is picked in the dialog instead. */
  projectId: string | null;
  projects: ThreadProject[];
  canStartInternal: boolean;
  /** Everyone on the project, so a conversation can be addressed to some of them. */
  people: ThreadPerson[];
}) {
  const [state, action, pending] = useActionState(createThreadAction, idle);
  const toast = useToast();
  const [chosenProject, setChosenProject] = useState(
    projectId ?? projects[0]?.id ?? "",
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Conversation started.");
      onClose();
    } else if (state.message && !state.errors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /*
   * On a project page the recipients are fixed. On the inbox they follow the
   * dropdown, so switching project cannot leave a name ticked from the last
   * one — the action would reject it anyway, but the list would lie.
   */
  const recipients = projectId
    ? people
    : (projects.find((p) => p.id === chosenProject)?.people ?? []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title="Start a conversation"
      description="Everyone on the project sees this thread unless you name people or mark it internal."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="thread-form" variant="primary" loading={pending}>
            Send
          </Button>
        </>
      }
    >
      <form id="thread-form" action={action} className="space-y-4 pb-2">
        {projectId ? (
          <input type="hidden" name="projectId" value={projectId} />
        ) : (
          <Select
            label="Project"
            name="projectId"
            required
            value={chosenProject}
            onChange={(e) => setChosenProject(e.target.value)}
            error={state.errors?.projectId}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          label="Subject"
          name="subject"
          required
          placeholder="July progress and next month's plan"
          defaultValue=""
          error={state.errors?.subject}
          data-autofocus
        />
        <Textarea
          label="Message"
          name="body"
          rows={5}
          required
          placeholder="Write your first message…"
          error={state.errors?.body}
        />
        {recipients.length ? (
          <fieldset className="well p-3.5">
            <legend className="text-muted px-1 text-[12.5px] font-medium">
              Who is this for?
            </legend>
            <p className="text-faint mb-2.5 text-[11.5px] leading-4">
              Leave everyone unticked to post it to the whole project. Tick names
              to keep the conversation between you and them.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {recipients.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-[var(--surface-hover)]"
                >
                  <input
                    type="checkbox"
                    name="participantIds"
                    value={p.id}
                    className="size-3.5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="text-body min-w-0 truncate">{p.name}</span>
                  {p.isClient ? (
                    <span className="text-faint shrink-0 text-[11px]">client</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {canStartInternal ? (
          <Checkbox
            label="Internal thread"
            description="Only the agency team can see internal threads — the client never does. A client ticked above is dropped from an internal thread."
            name="isInternal"
          />
        ) : null}
      </form>
    </Dialog>
  );
}

export function ThreadPlaceholder() {
  return (
    <div className="panel grid h-[calc(100dvh-19rem)] min-h-[420px] place-items-center">
      <EmptyState
        title="Pick a conversation"
        description="Select a thread on the left to read it, or start a new one."
      />
    </div>
  );
}
