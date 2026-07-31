"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { useToast } from "@/components/ui/toast";

/* ════════════════════════════════════════════════════════════════
   Keeps the Messages badge honest from anywhere in the app.

   The badge is rendered on the server, so before this it only moved
   when you navigated. A client could reply and nobody would notice
   until they happened to click something.

   Polling rather than a socket: Vercel's serverless functions do not
   hold long-lived connections, so SSE/WebSocket would need a separate
   always-on service. One small query every few seconds is the right
   trade for a team tool of this size — and it backs off to nothing
   while the tab is in the background.
   ════════════════════════════════════════════════════════════════ */

const ACTIVE_MS = 15_000;

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { unread: null }));

export function LiveUnread({
  initial,
  onChange,
}: {
  initial: number;
  onChange: (unread: number) => void;
}) {
  const toast = useToast();
  const [visible, setVisible] = useState(true);
  const previous = useRef(initial);
  const announced = useRef(false);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const { data } = useSWR<{ unread: number | null }>("/api/notifications", fetcher, {
    // Stop polling entirely when the tab is hidden; revalidate on return.
    refreshInterval: visible ? ACTIVE_MS : 0,
    revalidateOnFocus: true,
    fallbackData: { unread: initial },
  });

  const unread = data?.unread;

  useEffect(() => {
    if (unread === null || unread === undefined) return;
    onChange(unread);

    // Only announce a genuine increase, and never on the first poll —
    // otherwise every page load would toast the standing count.
    if (announced.current && unread > previous.current) {
      const added = unread - previous.current;
      toast.info(
        added === 1 ? "New message" : `${added} new messages`,
        "Open Messages to read the thread.",
      );
    }
    announced.current = true;
    previous.current = unread;
  }, [unread, onChange, toast]);

  return null;
}
