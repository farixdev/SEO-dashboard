"use client";

import { useSyncExternalStore } from "react";

/* ════════════════════════════════════════════════════════════════
   A single "the server is working" signal.

   Filtering, sorting, paging and changing page size all call
   `router.replace` inside a transition. React deliberately keeps the
   old page on screen during a transition and does NOT show the route's
   loading.tsx — which is the right behaviour, but with no other cue it
   reads as a dead click, and people click again.

   The controls are siblings scattered across server-rendered pages, so
   there is no common client parent to hold this state. A tiny module
   store lets any control raise the flag and one bar at the top of the
   app render it.
   ════════════════════════════════════════════════════════════════ */

let inFlight = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function beginNavigation() {
  inFlight += 1;
  emit();
}

export function endNavigation() {
  inFlight = Math.max(0, inFlight - 1);
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => inFlight > 0;
// The server never has work in flight.
const getServerSnapshot = () => false;

export function useIsNavigating() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The bar itself. Fixed to the very top so it is visible from anywhere on
 * the page, including part-way down a long table.
 */
export function RouteProgress() {
  const busy = useIsNavigating();

  return (
    <div
      aria-hidden={!busy}
      role="status"
      aria-live="polite"
      aria-label={busy ? "Loading" : undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: busy ? 1 : 0, transition: "opacity 150ms ease" }}
    >
      {busy ? (
        <div
          className="h-full w-full origin-left"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--accent), color-mix(in oklab, var(--accent) 55%, transparent))",
            animation: "route-progress 1.1s ease-in-out infinite",
          }}
        />
      ) : null}
    </div>
  );
}
