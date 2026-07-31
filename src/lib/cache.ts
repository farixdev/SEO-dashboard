import "server-only";

import { revalidateTag, unstable_cache, updateTag } from "next/cache";

/* ════════════════════════════════════════════════════════════════
   Data cache.

   Dashboard aggregates are expensive — a dozen grouped queries over
   ~1,800 backlinks and ~1,200 rank rows, each a separate HTTP round
   trip to Neon. They change only when someone edits data, so they are
   cached between requests and dropped the moment a mutation lands.
   Measured effect on the agency home page: 4.2s → 0.8s.

   Three layers are at work:
     · React `cache()`   — dedupes within one render pass (see lib/auth)
     · `unstable_cache`  — persists across requests, and across restarts
                           via .next/cache, until a tag is invalidated
     · revalidatePath    — clears Next's router cache for the page

   Paginated list queries are deliberately NOT cached: their filter
   combinations are unbounded, and the team expects a table to reflect an
   edit immediately. Messaging is not cached either — it must stay live.

   Note for anyone testing this: `unstable_cache` writes through to
   .next/cache, so restarting the server does NOT give you a cold cache.
   Delete .next/cache first or you will be served yesterday's answer and
   conclude something is broken.
   ════════════════════════════════════════════════════════════════ */

/** Upper bound on staleness, and the backstop if an invalidate is missed. */
export const CACHE_TTL = {
  /** aggregates that change whenever data is edited */
  aggregate: 300,
  /** reference lists — page options, month lists, staff */
  reference: 600,
  /** cross-project rollups on the agency home page */
  rollup: 120,
} as const;

/**
 * Tag namespace. Every tag is project-scoped, so editing one client's data
 * never drops another client's cache.
 */
export const tags = {
  /** everything for one project — emitted by every invalidate() */
  project: (projectId: string) => `project:${projectId}`,

  backlinks: (projectId: string) => `project:${projectId}:backlinks`,
  keywords: (projectId: string) => `project:${projectId}:keywords`,
  pages: (projectId: string) => `project:${projectId}:pages`,
  rankings: (projectId: string) => `project:${projectId}:rankings`,
  analytics: (projectId: string) => `project:${projectId}:analytics`,
  tasks: (projectId: string) => `project:${projectId}:tasks`,
  threads: (projectId: string) => `project:${projectId}:threads`,

  /** the project list itself, and cross-project rollups */
  projectList: () => "projects",
  /** user accounts — affects assignee pickers and team tables */
  users: () => "users",
} as const;

/* ── Reads ─────────────────────────────────────────────────────── */

/** Stable key part. Arrays sort so member order cannot fragment the cache. */
function keyPart(value: unknown): string {
  if (value === null || value === undefined) return "~";
  if (Array.isArray(value)) return `[${[...value].map(keyPart).sort().join(",")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Wraps a query so repeat calls with the same arguments are served from cache
 * until one of its tags is invalidated or the TTL lapses.
 *
 * Arguments become part of the cache key, so `getProjectKpis(a, "2026-06-01")`
 * and `getProjectKpis(a, "2026-05-01")` are cached separately. `tagsFor`
 * receives the same arguments so tags can be project-scoped.
 */
export function cachedQuery<Args extends readonly unknown[], Result>(
  keyPrefix: string,
  query: (...args: Args) => Promise<Result>,
  tagsFor: (...args: Args) => string[],
  revalidate: number = CACHE_TTL.aggregate,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    try {
      return await unstable_cache(
        () => query(...args),
        [keyPrefix, ...args.map(keyPart)],
        { tags: tagsFor(...args), revalidate },
      )();
    } catch (error) {
      // `unstable_cache` needs Next's incremental cache, which only exists
      // inside a request. Called from a script (parity checks, seeding, a
      // one-off report) it throws this invariant — run the query directly
      // rather than making callers care where they are.
      if (
        error instanceof Error &&
        /incrementalCache missing|static generation store missing/i.test(error.message)
      ) {
        return query(...args);
      }
      throw error;
    }
  };
}

/* ── Invalidation ──────────────────────────────────────────────── */

type Entity =
  | "backlinks"
  | "keywords"
  | "pages"
  | "rankings"
  | "analytics"
  | "tasks"
  | "threads";

/**
 * Expires every cached entry carrying this tag.
 *
 *   revalidateTag(tag, "max") — the load-bearing call; expires the entries
 *                               `cachedQuery` wrote.
 *   updateTag(tag)            — adds read-your-own-writes so the re-render
 *                               immediately after a Server Action is fresh.
 *                               Throws outside a Server Action, which is fine.
 */
function purge(tag: string) {
  revalidateTag(tag, "max");
  try {
    updateTag(tag);
  } catch {
    // Not inside a Server Action — revalidateTag above already did the work.
  }
}

/**
 * Invalidates the caches affected by editing one entity.
 *
 * The dependency edges are real and easy to forget at a call site, so they
 * are declared once here:
 *
 *   backlinks → keyword link counts, team performance, dashboards
 *   keywords  → page keyword counts, rank grids, dashboards
 *   pages     → keyword page mapping
 *   rankings  → keyword positions, dashboards
 *
 * Every cached, project-scoped query also carries `tags.project(projectId)`,
 * which is emitted unconditionally — so a missed entity edge degrades to
 * "dropped more than needed", never to a stale figure.
 */
export function invalidate(projectId: string, ...entities: Entity[]) {
  const affected = new Set<string>([
    tags.project(projectId),
    // Any data edit can move a number on the agency home page.
    tags.projectList(),
  ]);

  for (const entity of entities) {
    affected.add(tags[entity](projectId));

    switch (entity) {
      case "backlinks":
        affected.add(tags.keywords(projectId));
        break;
      case "keywords":
        affected.add(tags.pages(projectId));
        affected.add(tags.rankings(projectId));
        break;
      case "pages":
        affected.add(tags.keywords(projectId));
        break;
      case "rankings":
        affected.add(tags.keywords(projectId));
        break;
      default:
        break;
    }
  }

  for (const tag of affected) purge(tag);
}

/** Everything for one project — used after a bulk import. */
export function invalidateProject(projectId: string) {
  invalidate(
    projectId,
    "backlinks",
    "keywords",
    "pages",
    "rankings",
    "analytics",
    "tasks",
    "threads",
  );
}

/** Project list and rollups, without touching per-project data caches. */
export function invalidateProjectList() {
  purge(tags.projectList());
}

/** User accounts changed — assignee pickers and team tables must refresh. */
export function invalidateUsers() {
  purge(tags.users());
  purge(tags.projectList());
}
