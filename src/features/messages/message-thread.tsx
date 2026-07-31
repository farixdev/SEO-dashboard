"use client";

import { CheckCheck, Lock, Send } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { MessageRow } from "@/db/queries/messages";
import { idle } from "@/lib/action-state";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

import { markThreadReadAction, sendMessageAction } from "./actions";

type SerialisedMessage = Omit<MessageRow, "createdAt" | "editedAt"> & {
  createdAt: string;
  editedAt: string | null;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load messages");
  return (await res.json()) as { messages: SerialisedMessage[] };
};

export function MessageThread({
  threadId,
  subject,
  status,
  isInternal,
  initialMessages,
  currentUserId,
  currentUserRole,
}: {
  threadId: string;
  subject: string;
  status: string;
  isInternal: boolean;
  initialMessages: SerialisedMessage[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [state, action, pending] = useActionState(sendMessageAction, idle);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  // Poll while the tab is visible so a reply shows up without a refresh.
  const { data, mutate } = useSWR(`/api/threads/${threadId}/messages`, fetcher, {
    fallbackData: { messages: initialMessages },
    refreshInterval: 8000,
    revalidateOnFocus: true,
  });

  const messages = data?.messages ?? initialMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Clear the composer and refetch as soon as the send succeeds.
  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the composer in response to a server action result
      setDraft("");
      void mutate();
    } else if (state.message) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Mark read on mount and whenever new messages arrive.
  useEffect(() => {
    const fd = new FormData();
    fd.set("threadId", threadId);
    void markThreadReadAction(fd);
  }, [threadId, messages.length]);

  return (
    <div className="panel flex h-[calc(100dvh-19rem)] min-h-[420px] flex-col">
      <header
        className="flex items-start justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <div className="min-w-0">
          <h2 className="text-strong truncate text-[15px] font-semibold">{subject}</h2>
          <p className="text-faint mt-0.5 text-[11.5px]">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isInternal ? (
            <Badge tone="warning">
              <Lock className="mr-0.5 size-2.5" />
              Internal
            </Badge>
          ) : null}
          <Badge tone={status === "OPEN" ? "info" : "success"} dot>
            {status === "OPEN" ? "Open" : "Resolved"}
          </Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-faint py-10 text-center text-[12.5px]">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((message, i) => {
            const mine = message.authorId === currentUserId;
            const previous = messages[i - 1];
            const grouped =
              previous?.authorId === message.authorId &&
              new Date(message.createdAt).getTime() -
                new Date(previous.createdAt).getTime() <
                5 * 60 * 1000;

            return (
              <div
                key={message.id}
                className={cn("flex gap-2.5", mine && "flex-row-reverse")}
              >
                <div className={cn("w-8 shrink-0", grouped && "opacity-0")}>
                  {!grouped ? (
                    <Avatar
                      name={message.authorName}
                      color={message.authorColor}
                      size="sm"
                    />
                  ) : null}
                </div>

                <div
                  className={cn(
                    "min-w-0 max-w-[min(78%,34rem)]",
                    mine && "flex flex-col items-end",
                  )}
                >
                  {!grouped ? (
                    <div
                      className={cn(
                        "mb-1 flex items-baseline gap-2",
                        mine && "flex-row-reverse",
                      )}
                    >
                      <span className="text-strong text-[12.5px] font-semibold">
                        {mine ? "You" : message.authorName}
                      </span>
                      {!mine && message.authorRole ? (
                        <span className="text-faint text-[11px]">
                          {ROLE_LABELS[message.authorRole as UserRole] ??
                            message.authorRole}
                        </span>
                      ) : null}
                      <time
                        className="text-faint text-[11px]"
                        dateTime={message.createdAt}
                        title={formatDateTime(message.createdAt)}
                      >
                        {relativeTime(message.createdAt)}
                      </time>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.5] whitespace-pre-wrap",
                      mine
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "surface-sunken text-body shadow-[var(--rim)]",
                    )}
                  >
                    {message.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        ref={formRef}
        action={action}
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <input type="hidden" name="threadId" value={threadId} />
        <div className="flex items-end gap-2">
          <textarea
            name="body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) formRef.current?.requestSubmit();
              }
            }}
            rows={2}
            required
            placeholder={
              currentUserRole === "CLIENT"
                ? "Ask a question or share an update with your SEO team…"
                : "Reply to the client…"
            }
            aria-label="Message"
            className={cn(
              "surface-sunken text-strong max-h-40 min-h-[42px] flex-1 resize-y rounded-xl px-3 py-2.5 text-[13px]",
              "shadow-[var(--inset-well)] placeholder:text-[var(--text-faint)]",
              "focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none",
            )}
          />
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            disabled={!draft.trim()}
            aria-label="Send message"
          >
            <Send className="size-4" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <p className="text-faint mt-1.5 flex items-center gap-1 text-[11px]">
          <CheckCheck className="size-3" />
          Enter to send · Shift + Enter for a new line
        </p>
      </form>
    </div>
  );
}
