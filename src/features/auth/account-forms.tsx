"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { AVATAR_COLORS } from "@/lib/constants";

import { changePasswordAction, updateProfileAction } from "./actions";

export function ProfileForm({
  name,
  email,
  title,
  phone,
  avatarColor,
  roleLabel,
}: {
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  avatarColor: string;
  roleLabel: string;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message && !state.errors) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <CardHeader
        title="Your profile"
        description="Your name is what teammates and clients see on messages and activity."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              name="name"
              required
              defaultValue={name}
              error={state.errors?.name}
            />
            <Input
              label="Email"
              value={email}
              disabled
              help="Ask an admin to change your sign-in email."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Job title"
              name="title"
              placeholder="Link building specialist"
              defaultValue={title ?? ""}
            />
            <Input
              label="Phone"
              name="phone"
              type="tel"
              placeholder="+1 555 000 0000"
              defaultValue={phone ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Avatar colour"
              name="avatarColor"
              defaultValue={avatarColor}
              options={AVATAR_COLORS.map((c) => ({
                value: c,
                label: c.charAt(0).toUpperCase() + c.slice(1),
              }))}
            />
            <Input label="Role" value={roleLabel} disabled />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PasswordForm({ mustChange = false }: { mustChange?: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message && !state.errors) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card
      className={
        mustChange
          ? "border border-[color-mix(in_oklab,var(--color-amber-500)_35%,transparent)]"
          : undefined
      }
    >
      <div id="password" className="scroll-mt-6" />
      <CardHeader
        title="Change password"
        description={
          mustChange
            ? "You are still using a temporary password. Please set your own now."
            : "Use at least 8 characters, including a number."
        }
      />
      <CardBody>
        <form action={action} className="space-y-4">
          <Input
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            error={state.errors?.currentPassword}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="New password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              error={state.errors?.newPassword}
            />
            <Input
              label="Confirm new password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              error={state.errors?.confirmPassword}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
