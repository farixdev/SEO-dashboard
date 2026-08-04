/* ════════════════════════════════════════════════════════════════
   Explanations shown by the ⓘ marker next to headings.

   Kept in one file rather than scattered through JSX so the wording
   stays consistent, and so the answer to "what feeds this and what
   does changing it break?" lives next to every other answer.

   Four fields, and each earns its place:
     what      — what the thing is, in the reader's language
     source    — where the number actually comes from
     affects   — what moves if you change it
     automatic — what the system does for you, so nobody types it twice
   ════════════════════════════════════════════════════════════════ */

export type HelpEntry = {
  title: string;
  what: string;
  source?: string;
  affects?: string;
  automatic?: string;
};

export const HELP = {
  /* ── Keywords ────────────────────────────────────────────────── */

  keywords: {
    title: "Keywords",
    what: "Every search term this project is trying to rank for, with the page each one is meant to win.",
    source: "Added here, or imported from the Keywords List sheet.",
    affects:
      "Deleting a keyword deletes its whole rank history with it. Unmapping a page leaves the keyword, it just stops inheriting that page's URL.",
    automatic:
      "Target URL and focus keyword are inherited from the mapped page, so they cannot drift apart. Link counts and progress are derived, never typed.",
  },

  keywordLinks: {
    title: "Links pointing at this keyword",
    what: "How many backlinks carry this keyword as their anchor text.",
    source:
      "Counted from the Backlinks tab — a link counts if either of its anchor slots matches the keyword.",
    automatic:
      "Matched ignoring case and spacing, the way the spreadsheet's COUNTIFS did. A link carrying the same keyword in both anchor slots still counts once.",
  },

  keywordProgress: {
    title: "Link progress",
    what: "How far this keyword has got towards its backlink target.",
    source: "Indexed links pointing at the keyword, over the target you set on it.",
    affects: "Shows nothing while the target is 0 — set one to start tracking.",
    automatic: "Recalculated whenever a link is added, deleted, or marked indexed.",
  },

  /* ── Backlinks ───────────────────────────────────────────────── */

  backlinks: {
    title: "Backlinks",
    what: "Every link built to this site, who built it, and whether Google has indexed it.",
    source: "Added here, or imported from the Backlinks sheet.",
    affects:
      "Deleting links changes the client's totals immediately, and the anchor keyword's link count with them.",
    automatic:
      "The month a link belongs to comes from its published date. New links are credited to whoever adds them.",
  },

  backlinkIndexed: {
    title: "Indexed",
    what: "Whether Google has actually indexed the page carrying this link. An unindexed link passes no value.",
    source: "Set here, by whoever checked it.",
    affects:
      "Feeds the index rate on the dashboard and the client's report, and the keyword's link progress.",
    automatic: "Every change is written to the activity log with who made it.",
  },

  backlinkOwner: {
    title: "Built by",
    what: "The specialist who built this link. Their whole performance row is counted from this field.",
    affects:
      "Reassigning a link moves the credit on the Team tab straight away.",
    automatic:
      "Defaults to you when you add a link. Editing an existing one keeps whoever it already had, so editing never steals credit.",
  },

  backlinkCredentials: {
    title: "Login details",
    what: "The account used to place the link, if the site needed one.",
    affects: "Staff only, always.",
    automatic:
      "Never sent to the client portal or included in a client CSV export — the query that serves them cannot return these columns at all.",
  },

  /* ── On-page ─────────────────────────────────────────────────── */

  pages: {
    title: "On-page SEO",
    what: "Every page being optimised, with its audit checklist and score.",
    source: "Added here, or imported from the On Page SEO sheet.",
    affects:
      "Deleting a page unmaps any keyword pointing at it — the keywords survive, they just lose their target URL.",
    automatic:
      "The keyword count per page is derived from the keywords mapped to it, never typed.",
  },

  pageHealth: {
    title: "Page health",
    what: "The traffic-light dot, carried over from the spreadsheet's row colouring.",
    source:
      "Green when the SEO score is 80+, the page is indexed and on-page work is done. Amber when it is partway. Red otherwise.",
    automatic: "Recalculated on every read — there is nothing to refresh.",
  },

  /* ── Rankings ────────────────────────────────────────────────── */

  rankings: {
    title: "Rankings",
    what: "Where each keyword sits in Google, month by month.",
    source: "Typed into the entry grid, or imported from a rank tracker export.",
    affects:
      "Feeds the page-1 counts, the average position, and the client's whole progress story.",
    automatic:
      "The SERP page is derived from the position — position 14 is page 2. Blank means 'not ranking' and clears that month.",
  },

  rankingMonth: {
    title: "Which month you are entering",
    what: "The month these positions are filed under.",
    affects:
      "Everything monthly keys off this: the client's report, the trend charts, the month-on-month deltas.",
    automatic:
      "The check date is limited to inside this month, so a row can never be filed under one month and stamped with another. You can open any past month, including ones you skipped.",
  },

  /* ── Search Console ──────────────────────────────────────────── */

  analytics: {
    title: "Search Console data",
    what: "Monthly clicks, impressions and organic sessions, as Google reports them.",
    source: "Pulled from Search Console and Analytics by hand, then entered here.",
    affects: "Deleting a month recalculates the following month's growth rate.",
    automatic:
      "Click-through rate and month-on-month growth are calculated, never typed. The month, capture date and country are pre-filled.",
  },

  /* ── Team ────────────────────────────────────────────────────── */

  teamPerformance: {
    title: "Team performance",
    what: "What each specialist has produced, and how much of it stuck.",
    source: "Counted from the 'Built by' field on every backlink.",
    affects:
      "Reassigning or deleting links moves these numbers. Nothing here is entered by hand.",
    automatic: "Recalculated on every read from the links themselves.",
  },

  /* ── Deliverables ────────────────────────────────────────────── */

  tasks: {
    title: "Deliverables",
    what: "The work board. Anything marked client-visible also appears in the client's portal.",
    affects:
      "Moving a card to Done stamps the completion date, which decides the month it appears in on the client's report.",
    automatic:
      "The completion date is only set when the status actually changes — editing a finished task later does not move it into the wrong month.",
  },

  /* ── Messaging ───────────────────────────────────────────────── */

  messages: {
    title: "Messages",
    what: "Conversations with the client, internal threads only the agency can see, and private ones between named people.",
    source:
      "Start one from any project, or from the Inbox — there you pick the project in the dialog.",
    affects:
      "Leave everyone unticked and the whole project sees it. Tick names and only those people and you can see it, from every screen and every notification. Internal threads are invisible to the client, even by direct link.",
    automatic:
      "The unread badge updates on its own every few seconds, wherever you are in the app, and a new message raises a notification. A conversation you are not part of never raises yours.",
  },

  /* ── Access ──────────────────────────────────────────────────── */

  people: {
    title: "People and access",
    what: "Team accounts for the console, and client logins for the portal.",
    affects:
      "Deactivating an account locks it out on the next request. Removing a client from their project leaves their portal with nothing to show.",
    automatic:
      "You never handle anyone's password: invites are one-time links, and the person sets their own. Expired invites are swept nightly.",
  },

  invites: {
    title: "Invite links",
    what: "A one-time link that lets someone set their own password and sign straight in.",
    affects:
      "Issuing a new link invalidates the previous one. You choose how long it stays valid — 24 hours through 6 months, or never.",
    automatic:
      "Works once, and stored only as a hash — so it cannot be recovered from the database or reused if forwarded. Links with a deadline are swept away nightly once they lapse; a link set to never expire is left alone.",
  },

  /* ── Dashboard ───────────────────────────────────────────────── */

  targets: {
    title: "Monthly targets",
    what: "What this project is aiming for each month. Every progress ring measures against these.",
    source: "Set per project, in project settings.",
    affects: "Changing a target immediately re-scales every ring that uses it.",
  },

  reportMonth: {
    title: "Reporting month",
    what: "Which month everything on this page is showing.",
    automatic:
      "Opens on the newest month that actually holds data, rather than the calendar month — so a report is never empty just because the month has only just started.",
  },

  clientReport: {
    title: "Monthly report",
    what: "A printable summary for the client. Print to PDF from your browser.",
    source: "Built from the same figures as the dashboard, for the selected month.",
    automatic:
      "Assembled on demand — there is nothing to generate or refresh. Backlink login details are never included.",
  },

  /* ── Import ──────────────────────────────────────────────────── */

  importPanel: {
    title: "Bulk import",
    what: "Paste rows straight out of a spreadsheet to add or update many records at once.",
    affects:
      "Matches existing records rather than duplicating them, so re-pasting the same export is safe.",
    automatic:
      "Repeated rows are collapsed, unrecognised values are reported rather than silently changed, and anything skipped is counted in the summary.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;
