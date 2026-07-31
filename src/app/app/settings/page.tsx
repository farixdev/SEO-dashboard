import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DetailRow, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PasswordForm, ProfileForm } from "@/features/auth/account-forms";
import { requireStaff } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "My account" };

export default async function AccountSettingsPage() {
  const user = await requireStaff();

  const [row] = await db
    .select({
      title: users.title,
      phone: users.phone,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <>
      <PageHeader
        title="My account"
        description="Your profile, password, and what your role gives you access to."
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
          <CardHeader title="Access" />
          <CardBody>
            <dl className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
              <DetailRow label="Role">{ROLE_LABELS[user.role]}</DetailRow>
              <DetailRow label="What that means">
                <span className="text-muted font-normal">
                  {ROLE_DESCRIPTIONS[user.role]}
                </span>
              </DetailRow>
              <DetailRow label="Projects you can see">
                {user.role === "ADMIN" || user.role === "MANAGER"
                  ? "All projects"
                  : `${user.projectIds.length} assigned`}
              </DetailRow>
              <DetailRow label="Last sign-in">
                {row?.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—"}
              </DetailRow>
              <DetailRow label="Account created">
                {row?.createdAt ? formatDateTime(row.createdAt) : "—"}
              </DetailRow>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
