import {
  Inbox,
  LayoutGrid,
  Settings,
  Users,
} from "lucide-react";

import { AppShell, ProjectSwitcher } from "@/components/layout/shell";
import { db } from "@/db";
import { getUnreadCount } from "@/db/queries/projects";
import { projects } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { inArray } from "drizzle-orm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();

  const [projectList, unread] = await Promise.all([
    user.projectIds.length
      ? db
          .select({
            id: projects.id,
            name: projects.name,
            clientCompany: projects.clientCompany,
          })
          .from(projects)
          .where(inArray(projects.id, user.projectIds))
          .orderBy(projects.name)
      : Promise.resolve([]),
    getUnreadCount(user.id, user.projectIds),
  ]);

  const groups = [
    {
      links: [
        {
          href: "/app",
          label: "Projects",
          icon: <LayoutGrid className="size-4" />,
          exact: true,
        },
        {
          href: "/app/inbox",
          label: "Inbox",
          icon: <Inbox className="size-4" />,
          badge: unread || undefined,
          // Kept live by polling, so it moves without a navigation.
          liveBadge: true,
        },
      ],
    },
    {
      label: "Agency",
      links: [
        ...(user.role === "ADMIN"
          ? [
              {
                href: "/app/team",
                label: "People & access",
                icon: <Users className="size-4" />,
              },
            ]
          : []),
        {
          href: "/app/settings",
          label: "My account",
          icon: <Settings className="size-4" />,
        },
      ],
    },
  ];

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        avatarColor: user.avatarColor,
        title: user.title,
      }}
      brand="SEO Dashboard"
      brandSubtitle="Agency console"
      settingsHref="/app/settings"
      groups={groups}
      aside={<ProjectSwitcher projects={projectList} />}
    >
      {children}
    </AppShell>
  );
}
