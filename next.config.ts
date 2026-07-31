import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["bcryptjs", "xlsx"],
  experimental: {
    // Server Actions receive CSV/XLSX payloads on bulk import.
    serverActions: { bodySizeLimit: "12mb" },

    /*
     * How long the browser may reuse a page it has already loaded.
     *
     * Every route here is dynamic (they all read a session cookie), and Next's
     * default for dynamic routes is 0 — so Keywords → Backlinks → back to
     * Keywords re-fetched Keywords from the server every single time, shimmer
     * and all, even when nothing had changed.
     *
     * Raising it is only safe because a write always drops this cache. Every
     * mutating Server Action calls `invalidate*()` in lib/cache.ts, whose
     * `purge()` calls `updateTag()`. Next counts a tag WITHOUT a cache profile
     * as "the client must throw everything away": it sets the
     * `x-action-revalidated` header, and the client then runs
     * `invalidateEntirePrefetchCache()` and re-renders with `RefreshAll`.
     * `revalidateTag(tag, "max")` on its own would NOT do that — a tag with a
     * profile is stale-while-revalidate and deliberately leaves the client
     * cache alone. Both calls are needed, and both are there. Signing out
     * clears it too, since deleting the session cookie counts for the same
     * header.
     *
     * The only staleness this window can introduce is *someone else's* edit,
     * and 120s sits well inside the 300s TTL the server-side aggregates
     * already run with — so it does not make anything less fresh than it
     * already was.
     */
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },
};

export default nextConfig;
