import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";

import { MiniStat } from "@/components/charts/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { projectMembers, projects, users } from "@/db/schema";
import { UserManager } from "@/features/users/user-manager";
import { HELP } from "@/lib/help";
import { requireAdmin } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "People & access" };

export default async function TeamAdminPage() {
  const admin = await requireAdmin();

  const [rows, memberships, projectList] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        title: users.title,
        phone: users.phone,
        avatarColor: users.avatarColor,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        // Evaluated by Postgres, not during render: `Date.now()` in a
        // component body is an impure call, and the server's clock is the
        // one that issued the expiry in the first place.
        hasPendingInvite: sql<boolean>`(
          ${users.inviteTokenHash} is not null
          and ${users.inviteAcceptedAt} is null
          -- a null expiry is "never expires", not "already lapsed"
          and (${users.inviteExpiresAt} is null or ${users.inviteExpiresAt} > now())
        )`,
        inviteExpiresAt: users.inviteExpiresAt,
      })
      .from(users)
      .orderBy(
        // Admins first, clients last, alphabetical inside each band.
        sql`case ${users.role}
              when 'ADMIN' then 0
              when 'MANAGER' then 1
              when 'SPECIALIST' then 2
              else 3
            end`,
        asc(users.name),
      ),
    db
      .select({
        userId: projectMembers.userId,
        projectName: projects.name,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name)),
  ]);

  const byUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = byUser.get(m.userId) ?? [];
    list.push(m.projectName);
    byUser.set(m.userId, list);
  }

  const enriched = rows.map(({ inviteExpiresAt, ...r }) => ({
    ...r,
    projectNames: byUser.get(r.id) ?? [],
    inviteExpiresAt: inviteExpiresAt ? inviteExpiresAt.toISOString() : null,
  }));

  const counts = {
    total: enriched.length,
    staff: enriched.filter((u) => u.role !== "CLIENT").length,
    clients: enriched.filter((u) => u.role === "CLIENT").length,
    inactive: enriched.filter((u) => !u.isActive).length,
  };

  return (
    <>
      <PageHeader
          help={HELP.people}
        title="People & access"
        description="Team accounts for the console, and client logins for the portal."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Accounts" value={formatNumber(counts.total)} />
        <MiniStat label="Agency team" value={formatNumber(counts.staff)} tone="brand" />
        <MiniStat label="Client logins" value={formatNumber(counts.clients)} tone="info" />
        <MiniStat
          label="Deactivated"
          value={formatNumber(counts.inactive)}
          tone={counts.inactive > 0 ? "warning" : "success"}
        />
      </div>

      <UserManager
        users={enriched}
        projects={projectList}
        currentUserId={admin.id}
      />

      <Card className="mt-6">
        <CardHeader
          title="What each role can do"
          description="Roles are enforced on the server for every read and write."
        />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            {USER_ROLES.map((role) => (
              <div key={role} className="well px-3.5 py-3">
                <dt className="text-strong text-[13px] font-semibold">
                  {ROLE_LABELS[role]}
                </dt>
                <dd className="text-muted mt-1 text-[12.5px] leading-[1.45]">
                  {ROLE_DESCRIPTIONS[role]}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </>
  );
}
