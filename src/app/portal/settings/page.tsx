import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailRow, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PasswordForm, ProfileForm } from "@/features/auth/account-forms";
import { ROLE_LABELS } from "@/lib/constants";
import { requirePortalProject } from "@/lib/portal";
import { formatDate, formatDateTime, hostOf } from "@/lib/utils";

export const metadata: Metadata = { title: "My account" };

export default async function PortalSettingsPage() {
  const { user, project } = await requirePortalProject();

  const [row] = await db
    .select({
      title: users.title,
      phone: users.phone,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <>
      <PageHeader
        title="My account"
        description="Your details and password for this portal."
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <ProfileForm
          name={user.name}
          email={user.email}
          title={row?.title ?? null}
          phone={row?.phone ?? null}
          avatarColor={user.avatarColor}
          roleLabel={ROLE_LABELS[user.role]}
        />

        <PasswordForm mustChange={user.mustChangePassword} />

        <Card>
          <CardHeader
            title="Your campaign"
            description="Contact your account manager through Messages to change any of this."
          />
          <CardBody>
            <dl className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              <DetailRow label="Project">{project.name}</DetailRow>
              <DetailRow label="Website">
                <a
                  href={project.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  {hostOf(project.websiteUrl)}
                </a>
              </DetailRow>
              <DetailRow label="Target market">{project.country}</DetailRow>
              <DetailRow label="Campaign started">
                {project.startDate ? formatDate(project.startDate) : "—"}
              </DetailRow>
              <DetailRow label="Monthly backlink target">
                {project.monthlyBacklinkTarget}
              </DetailRow>
              <DetailRow label="Last sign-in">
                {row?.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—"}
              </DetailRow>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
