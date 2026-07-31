import {
  BarChart3,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  ListChecks,
  MessagesSquare,
  Printer,
  Settings,
  TrendingUp,
} from "lucide-react";

import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/shell";
import { db } from "@/db";
import { getUnreadCount } from "@/db/queries/projects";
import { projects } from "@/db/schema";
import { getClientProjectId, requireClient } from "@/lib/auth";
import { eq } from "drizzle-orm";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireClient();

  const projectId = user.projectIds[0] ?? (await getClientProjectId(user.id));
  if (!projectId) {
    // A client with no project has nothing to show — surface it rather than 500.
    return (
      <main className="surface-app grid min-h-dvh place-items-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">No project linked yet</h1>
          <p className="text-muted mt-2 text-[13.5px] leading-5">
            Your account is not attached to a project. Please contact your
            account manager and they will add you.
          </p>
        </div>
      </main>
    );
  }

  const [[project], unread] = await Promise.all([
    db
      .select({ name: projects.name, clientCompany: projects.clientCompany })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
    // Clients never see internal threads, so they must not be counted.
    getUnreadCount(user.id, [projectId], false),
  ]);

  if (!project) redirect("/login");

  const groups = [
    {
      links: [
        {
          href: "/portal",
          label: "Overview",
          icon: <Gauge className="size-4" />,
          exact: true,
        },
        {
          href: "/portal/rankings",
          label: "Keyword rankings",
          icon: <TrendingUp className="size-4" />,
        },
        {
          href: "/portal/keywords",
          label: "Keyword list",
          icon: <KeyRound className="size-4" />,
        },
        {
          href: "/portal/backlinks",
          label: "Backlinks",
          icon: <Link2 className="size-4" />,
        },
        {
          href: "/portal/on-page",
          label: "Pages & content",
          icon: <FileText className="size-4" />,
        },
        {
          href: "/portal/analytics",
          label: "Search performance",
          icon: <BarChart3 className="size-4" />,
        },
      ],
    },
    {
      label: "Working together",
      links: [
        {
          href: "/portal/progress",
          label: "What we're working on",
          icon: <ListChecks className="size-4" />,
        },
        {
          href: "/portal/messages",
          label: "Messages",
          icon: <MessagesSquare className="size-4" />,
          badge: unread || undefined,
          // Kept live by polling, so it moves without a navigation.
          liveBadge: true,
        },
        {
          href: "/portal/report",
          label: "Monthly report",
          icon: <Printer className="size-4" />,
        },
        {
          href: "/portal/settings",
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
      brand={project.clientCompany ?? project.name}
      brandSubtitle="SEO progress"
      settingsHref="/portal/settings"
      groups={groups}
    >
      {children}
    </AppShell>
  );
}
