import { UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { getProjectMembers } from "@/db/queries/projects";
import { getAllStaff } from "@/db/queries/team";
import { InviteButton } from "@/features/invites/invite-button";
import { DangerZone } from "@/features/projects/danger-zone";
import { MemberManager } from "@/features/projects/member-manager";
import { ProjectForm } from "@/features/projects/project-form";
import { RemoveMemberButton } from "@/features/projects/remove-member-button";
import { requireProjectAccess } from "@/lib/auth";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, project } = await requireProjectAccess(id);

  const [members, staff] = await Promise.all([getProjectMembers(id), getAllStaff()]);

  const assignable = staff.filter((s) => !members.some((m) => m.userId === s.id));

  return (
    <>
      <PageHeader
        title="Project settings"
        description="Details, targets, and who can see this project."
      />

      <div className="space-y-6">
        <ProjectForm
          row={{
            id: project.id,
            name: project.name,
            websiteUrl: project.websiteUrl,
            clientCompany: project.clientCompany,
            country: project.country,
            status: project.status,
            startDate: project.startDate,
            monthlyBacklinkTarget: project.monthlyBacklinkTarget,
            monthlyKeywordTarget: project.monthlyKeywordTarget,
            monthlyContentTarget: project.monthlyContentTarget,
            accentColor: project.accentColor,
            notes: project.notes,
          }}
        />

        <div className="mx-auto max-w-3xl space-y-6">
          <Card>
            <CardHeader
              title="Who can access this project"
              description="Clients get a read-only portal. Everyone else works in the console."
              icon={<UserPlus className="size-4" />}
            />
            <CardBody className="space-y-4">
              <ul className="space-y-2">
                {members.map((member) => (
                  <li
                    key={member.userId}
                    className="well flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <Avatar
                      name={member.name}
                      color={member.avatarColor}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-strong truncate text-[13px] font-medium">
                        {member.name}
                        {!member.isActive ? (
                          <Badge tone="danger" className="ml-2">
                            deactivated
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-faint truncate text-[11.5px]">
                        {member.email}
                        {member.lastLoginAt
                          ? ` · last in ${formatDateTime(member.lastLoginAt)}`
                          : " · never signed in"}
                      </p>
                    </div>
                    <Badge
                      tone={member.memberRole === "CLIENT_VIEWER" ? "info" : "brand"}
                    >
                      {member.memberRole === "CLIENT_VIEWER"
                        ? "Client"
                        : ROLE_LABELS[member.role as UserRole]}
                    </Badge>
                    <InviteButton
                      userId={member.userId}
                      userName={member.name}
                      userEmail={member.email}
                      hasPendingInvite={member.hasPendingInvite}
                      inviteExpiresAt={
                        member.inviteExpiresAt
                          ? member.inviteExpiresAt.toISOString()
                          : null
                      }
                      variant="ghost"
                      label={member.lastLoginAt ? "Re-invite" : "Send invite"}
                    />
                    <RemoveMemberButton
                      projectId={id}
                      userId={member.userId}
                      name={member.name}
                      isSelf={member.userId === user.id}
                      isClient={member.memberRole === "CLIENT_VIEWER"}
                    />
                  </li>
                ))}
                {members.length === 0 ? (
                  <li className="text-faint py-3 text-center text-[12.5px]">
                    Nobody is assigned to this project yet.
                  </li>
                ) : null}
              </ul>

              <MemberManager projectId={id} candidates={assignable} />
            </CardBody>
          </Card>

          {user.role === "ADMIN" ? (
            <DangerZone projectId={id} projectName={project.name} />
          ) : null}
        </div>
      </div>
    </>
  );
}

