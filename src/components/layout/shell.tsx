"use client";

import {
  Building2,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/misc";
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownLink,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { LiveUnread } from "@/components/layout/live-unread";
import { RouteProgress } from "@/components/ui/route-progress";
import { ThemeToggle } from "@/components/ui/theme";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { logoutAction } from "@/features/auth/actions";

export type NavLink = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  exact?: boolean;
  /** Tracks the polled unread count rather than the server-rendered one. */
  liveBadge?: boolean;
};

export type ShellUser = {
  name: string;
  email: string;
  role: UserRole;
  avatarColor: string;
  title?: string | null;
};

/* ── Sidebar ───────────────────────────────────────────────────── */

function SidebarNav({
  groups,
  onNavigate,
  liveUnread,
}: {
  groups: { label?: string; links: NavLink[] }[];
  onNavigate?: () => void;
  /** Polled unread count; overrides the server-rendered badge when present. */
  liveUnread?: number | null;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label ? (
            <p className="text-faint mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all",
                      active
                        ? "surface-raised text-strong shadow-[var(--elev-1),var(--rim)]"
                        : "text-muted hover:text-strong hover:bg-[var(--surface-hover)]",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 transition-colors",
                        active ? "text-[var(--accent)]" : "opacity-70",
                      )}
                    >
                      {link.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {(() => {
                      const count =
                        link.liveBadge &&
                        liveUnread !== null &&
                        liveUnread !== undefined
                          ? liveUnread
                          : (link.badge ?? 0);
                      if (!count) return null;
                      return (
                        <span className="tnum grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[10.5px] font-bold text-[var(--on-accent)]">
                          {count > 99 ? "99+" : count}
                        </span>
                      );
                    })()}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ user, settingsHref }: { user: ShellUser; settingsHref: string }) {
  return (
    <Dropdown
      /*
       * This sits in the sidebar footer, pinned to the bottom of the viewport.
       * Opening downward put the whole menu — including Sign out — below the
       * fold, so clicking your own avatar appeared to do nothing.
       */
      side="top"
      align="start"
      label="Account menu"
      className="min-w-56"
      triggerClassName="w-full"
      trigger={
        <div className="flex w-full items-center gap-2.5 px-1 py-1">
          <Avatar name={user.name} color={user.avatarColor} size="sm" />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-strong truncate text-[13px] leading-4 font-medium">
              {user.name}
            </p>
            <p className="text-faint truncate text-[11px] leading-4">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
          <ChevronsUpDown className="text-faint size-3.5 shrink-0" />
        </div>
      }
    >
      <DropdownLabel>{user.email}</DropdownLabel>
      <DropdownSeparator />
      <DropdownLink href={settingsHref} icon={<Settings className="size-4" />}>
        Account settings
      </DropdownLink>
      <DropdownLink
        href={`${settingsHref}#password`}
        icon={<KeyRound className="size-4" />}
      >
        Change password
      </DropdownLink>
      <DropdownSeparator />
      <form action={logoutAction}>
        <DropdownItem
          type="submit"
          icon={<LogOut className="size-4" />}
          tone="danger"
        >
          Sign out
        </DropdownItem>
      </form>
    </Dropdown>
  );
}

/* ── Shell ─────────────────────────────────────────────────────── */

export function AppShell({
  user,
  groups,
  brand,
  brandSubtitle,
  settingsHref,
  children,
  aside,
}: {
  user: ShellUser;
  groups: { label?: string; links: NavLink[] }[];
  brand: string;
  brandSubtitle?: string;
  settingsHref: string;
  children: ReactNode;
  /** optional element rendered under the brand — e.g. the project switcher */
  aside?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  /*
   * The server-rendered badge is a snapshot from the last navigation. This
   * holds the polled value so a message arriving while the user sits on any
   * other page still shows up.
   */
  const seededUnread = groups
    .flatMap((g) => g.links)
    .find((l) => l.liveBadge)?.badge;
  const [liveUnread, setLiveUnread] = useState<number | null>(null);
  const onUnreadChange = useCallback((n: number) => setLiveUnread(n), []);

  // Close the drawer whenever the route changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the mobile drawer in response to the router, an external system
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const sidebar = (
    <>
      <div className="px-4 pt-5 pb-3">
        <Link href={settingsHref.startsWith("/portal") ? "/portal" : "/app"} className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[13px] font-bold text-[var(--on-accent)]">
            {brand.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="text-strong block truncate text-[13.5px] leading-4 font-semibold">
              {brand}
            </span>
            {brandSubtitle ? (
              <span className="text-faint block truncate text-[11px] leading-4">
                {brandSubtitle}
              </span>
            ) : null}
          </span>
        </Link>
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>

      <SidebarNav
        groups={groups}
        onNavigate={() => setMobileOpen(false)}
        liveUnread={liveUnread}
      />

      <div
        className="space-y-3 border-t px-3 py-3"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <UserMenu user={user} settingsHref={settingsHref} />
        <div className="flex items-center justify-between px-1">
          <span className="text-faint text-[11px]">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </>
  );

  return (
    <div className="surface-app min-h-dvh">
      {/*
        Filtering, sorting and paging happen inside a transition, so React
        holds the old page on screen and the route's loading.tsx never fires.
        This is the only cue that the server is working.
      */}
      <RouteProgress />
      <LiveUnread initial={seededUnread ?? 0} onChange={onUnreadChange} />

      {/* Desktop sidebar */}
      <aside
        className="surface-panel fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r lg:flex"
        style={{ borderColor: "var(--line-soft)" }}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-[oklch(0.2_0.01_85_/_0.5)] backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="surface-panel animate-fade-up relative flex h-full w-[272px] flex-col shadow-[var(--elev-3)]">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="text-muted hover:text-strong absolute top-4 right-3 rounded-lg p-1.5"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      {/* Mobile top bar */}
      <div
        className="surface-panel sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 lg:hidden"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="text-muted hover:text-strong -ml-1.5 rounded-xl p-2"
        >
          <Menu className="size-5" />
        </button>
        <span className="text-strong flex-1 truncate text-[14px] font-semibold">
          {brand}
        </span>
        <Avatar name={user.name} color={user.avatarColor} size="sm" />
      </div>

      <main className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/* ── Project switcher ──────────────────────────────────────────── */

export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: { id: string; name: string; clientCompany: string | null }[];
  currentId?: string;
}) {
  const current = projects.find((p) => p.id === currentId);

  return (
    <Dropdown
      align="start"
      label="Switch project"
      className="max-h-80 min-w-60 overflow-y-auto"
      triggerClassName="w-full"
      trigger={
        <div className="well flex w-full items-center gap-2 px-2.5 py-2">
          <Building2 className="text-faint size-3.5 shrink-0" />
          <span className="text-body min-w-0 flex-1 truncate text-left text-[12.5px] font-medium">
            {current?.name ?? "All projects"}
          </span>
          <ChevronsUpDown className="text-faint size-3.5 shrink-0" />
        </div>
      }
    >
      <DropdownLabel>Projects</DropdownLabel>
      <DropdownLink href="/app">All projects</DropdownLink>
      <DropdownSeparator />
      {projects.map((p) => (
        <DropdownLink key={p.id} href={`/app/projects/${p.id}`}>
          {p.name}
        </DropdownLink>
      ))}
    </Dropdown>
  );
}
