import {
  BarChart3,
  ExternalLink,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  ListChecks,
  MessagesSquare,
  Settings,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

import { NavTabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { requireProjectAccess } from "@/lib/auth";
import { hostOf } from "@/lib/utils";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await requireProjectAccess(id);

  const base = `/app/projects/${id}`;
  const tabs = [
    { href: base, label: "Overview", icon: <Gauge className="size-4" />, exact: true },
    {
      href: `${base}/rankings`,
      label: "Rankings",
      icon: <TrendingUp className="size-4" />,
    },
    { href: `${base}/keywords`, label: "Keywords", icon: <KeyRound className="size-4" /> },
    { href: `${base}/backlinks`, label: "Backlinks", icon: <Link2 className="size-4" /> },
    { href: `${base}/on-page`, label: "On-page", icon: <FileText className="size-4" /> },
    {
      href: `${base}/analytics`,
      label: "Search data",
      icon: <BarChart3 className="size-4" />,
    },
    { href: `${base}/tasks`, label: "Tasks", icon: <ListChecks className="size-4" /> },
    { href: `${base}/team`, label: "Team", icon: <Users className="size-4" /> },
    {
      href: `${base}/messages`,
      label: "Messages",
      icon: <MessagesSquare className="size-4" />,
    },
    { href: `${base}/import`, label: "Import", icon: <Upload className="size-4" /> },
    {
      href: `${base}/settings`,
      label: "Settings",
      icon: <Settings className="size-4" />,
    },
  ];

  return (
    <>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-[22px] leading-8 font-semibold tracking-tight sm:text-2xl">
            {project.name}
          </h1>
          <Badge
            tone={
              project.status === "ACTIVE"
                ? "success"
                : project.status === "PAUSED"
                  ? "warning"
                  : "neutral"
            }
            dot
          >
            {project.status.toLowerCase()}
          </Badge>
          <a
            href={project.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-strong inline-flex items-center gap-1 text-[12.5px] transition-colors"
          >
            {hostOf(project.websiteUrl)}
            <ExternalLink className="size-3" />
          </a>
          {project.clientCompany ? (
            <span className="text-faint text-[12.5px]">· {project.clientCompany}</span>
          ) : null}
          <span className="text-faint text-[12.5px]">· {project.country}</span>
        </div>

        <div className="mt-4">
          <NavTabs items={tabs} />
        </div>
      </div>

      {children}
    </>
  );
}
