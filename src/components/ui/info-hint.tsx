"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type HelpEntry } from "@/lib/help";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   The small "what is this?" marker next to a heading.

   Rendered through a portal rather than as a positioned child: most
   of the places it appears are inside a card with `overflow-hidden`
   (so table corners clip cleanly), and a nested popup would be sliced
   off at the card edge. Portalling costs a measure on open and buys a
   bubble that can never be clipped.

   Opens on hover, focus, and click — hover alone is unusable on a
   touch screen and invisible to a keyboard.
   ════════════════════════════════════════════════════════════════ */

type Placement = { top: number; left: number; flipped: boolean };

export function InfoHint({
  help,
  className,
  label,
}: {
  help: HelpEntry;
  className?: string;
  /** Overrides the accessible name; defaults to "About <title>". */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal mount gate; createPortal needs a document
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const position = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const WIDTH = 288;
      const GAP = 10;
      const margin = 12;

      // Prefer centred under the marker, then clamp inside the viewport so it
      // is never half off-screen on a narrow window.
      const ideal = r.left + r.width / 2 - WIDTH / 2;
      const left = Math.min(
        Math.max(margin, ideal),
        Math.max(margin, window.innerWidth - WIDTH - margin),
      );
      const below = r.bottom + GAP;
      // Flip above when there is not enough room underneath.
      const flip = below + 190 > window.innerHeight && r.top > 210;
      // Decided here, while we already have the rect — reading the ref again
      // during render would be a render-time side effect.
      setPlace({ top: flip ? r.top - GAP : below, left, flipped: flip });
    };

    position();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", position);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", position);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label ?? `About ${help.title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Touch has no hover; a tap should latch it open.
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={cn(
          "text-faint hover:text-[var(--accent)] inline-grid size-4 shrink-0 place-items-center rounded-full align-middle transition-colors",
          open && "text-[var(--accent)]",
          className,
        )}
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </button>

      {mounted && open && place
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              className="panel-lg animate-fade pointer-events-none fixed z-[80] w-72 p-3.5"
              style={{
                top: place.top,
                left: place.left,
                transform: place.flipped ? "translateY(-100%)" : undefined,
              }}
            >
              <p className="text-strong text-[12.5px] leading-4 font-semibold">
                {help.title}
              </p>
              <p className="text-muted mt-1.5 text-[12px] leading-[1.5]">{help.what}</p>

              {help.source ? (
                <p className="text-muted mt-2 text-[12px] leading-[1.5]">
                  <span className="text-faint font-semibold">Comes from · </span>
                  {help.source}
                </p>
              ) : null}

              {help.affects ? (
                <p className="text-muted mt-1.5 text-[12px] leading-[1.5]">
                  <span className="text-faint font-semibold">Changing it · </span>
                  {help.affects}
                </p>
              ) : null}

              {help.automatic ? (
                <p className="mt-2.5 rounded-lg px-2 py-1.5 text-[11.5px] leading-[1.45] text-[var(--color-mint-700)] dark:text-[var(--color-mint-500)]"
                   style={{ background: "color-mix(in oklab, var(--color-mint-500) 12%, transparent)" }}>
                  <span className="font-semibold">Automatic · </span>
                  {help.automatic}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
