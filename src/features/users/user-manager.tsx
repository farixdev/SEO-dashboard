"use client";

import { KeyRound, Pencil, Plus, ShieldOff, Trash2, UserCheck } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  Table,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  TrEmpty,
} from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/dropdown";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_ROLES,
  type UserRole,
} from "@/lib/constants";
import { formatDateTime, relativeTime } from "@/lib/utils";

import { InviteButton } from "../invites/invite-button";

import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updateUserAction,
} from "./actions";

export type UserRowData = {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  phone: string | null;
  avatarColor: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  projectNames: string[];
  hasPendingInvite: boolean;
  inviteExpiresAt: string | null;
};

export function UserManager({
  users,
  projects,
  currentUserId,
}: {
  users: UserRowData[];
  projects: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRowData | null>(null);
  const [resetting, setResetting] = useState<UserRowData | null>(null);
  const [deleting, setDeleting] = useState<UserRowData | null>(null);
  const [, startTransition] = useTransition();

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add person
        </Button>
      </div>

      <TableShell>
        <Table minWidth={980}>
          <Thead>
            <Th>Person</Th>
            <Th width={140}>Role</Th>
            <Th>Projects</Th>
            <Th width={120}>Status</Th>
            <Th width={150}>Last sign-in</Th>
            <Th width={60} align="right" />
          </Thead>
          <Tbody>
            {users.length === 0 ? (
              <TrEmpty colSpan={6}>
                <EmptyState
                  title="No accounts yet"
                  description="Add your SEO team, then create client logins for each project."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                      <Plus className="size-4" />
                      Add the first person
                    </Button>
                  }
                />
              </TrEmpty>
            ) : (
              users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={user.name} color={user.avatarColor} size="sm" />
                      <div className="min-w-0">
                        <p className="text-strong truncate text-[13px] font-medium">
                          {user.name}
                          {user.id === currentUserId ? (
                            <span className="text-faint ml-1.5 text-[11px] font-normal">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-faint truncate text-[11.5px]">
                          {user.email}
                          {user.title ? ` · ${user.title}` : ""}
                        </p>
                      </div>
                    </div>
                  </Td>

                  <Td>
                    <Badge
                      tone={
                        user.role === "ADMIN"
                          ? "brand"
                          : user.role === "CLIENT"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {ROLE_LABELS[user.role as UserRole] ?? user.role}
                    </Badge>
                  </Td>

                  <Td className="max-w-[240px]">
                    {user.projectNames.length ? (
                      <span className="text-muted truncate text-[12px]">
                        {user.projectNames.join(", ")}
                      </span>
                    ) : (
                      <span className="text-faint text-[12px]">
                        {user.role === "ADMIN" || user.role === "MANAGER"
                          ? "All projects"
                          : "None assigned"}
                      </span>
                    )}
                  </Td>

                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={user.isActive ? "success" : "danger"} dot>
                        {user.isActive ? "Active" : "Disabled"}
                      </Badge>
                      {user.hasPendingInvite ? (
                        <Badge tone="info" title="Invite link sent, not yet used">
                          invited
                        </Badge>
                      ) : user.mustChangePassword ? (
                        <Badge tone="warning" title="Must set a new password on next sign-in">
                          temp pw
                        </Badge>
                      ) : null}
                    </div>
                  </Td>

                  <Td className="text-[12px]">
                    {user.lastLoginAt ? (
                      <span title={formatDateTime(user.lastLoginAt)}>
                        {relativeTime(user.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="text-faint">Never</span>
                    )}
                  </Td>

                  <Td align="right">
                    <div className="flex items-center justify-end gap-1.5">
                      <InviteButton
                        userId={user.id}
                        userName={user.name}
                        userEmail={user.email}
                        hasPendingInvite={user.hasPendingInvite}
                        inviteExpiresAt={user.inviteExpiresAt}
                        variant="ghost"
                        label={user.lastLoginAt ? "Re-invite" : "Invite"}
                      />
                    <Dropdown label={`Actions for ${user.name}`}>
                      <DropdownItem
                        icon={<Pencil className="size-4" />}
                        onClick={() => setEditing(user)}
                      >
                        Edit details
                      </DropdownItem>
                      <DropdownItem
                        icon={<KeyRound className="size-4" />}
                        onClick={() => setResetting(user)}
                      >
                        Reset password
                      </DropdownItem>
                      <DropdownSeparator />
                      <form
                        action={(fd) => {
                          startTransition(() => {
                            void toggleUserActiveAction(fd);
                          });
                        }}
                      >
                        <input type="hidden" name="id" value={user.id} />
                        <DropdownItem
                          type="submit"
                          disabled={user.id === currentUserId}
                          icon={
                            user.isActive ? (
                              <ShieldOff className="size-4" />
                            ) : (
                              <UserCheck className="size-4" />
                            )
                          }
                        >
                          {user.isActive ? "Deactivate" : "Reactivate"}
                        </DropdownItem>
                      </form>
                      <DropdownItem
                        icon={<Trash2 className="size-4" />}
                        tone="danger"
                        disabled={user.id === currentUserId}
                        onClick={() => setDeleting(user)}
                      >
                        Delete account
                      </DropdownItem>
                    </Dropdown>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </TableShell>

      {/*
        Same reason as the reset dialog below: this one swaps itself for a
        "here is the password" screen once `state` holds a result, and that
        state outlives a close. Left permanently mounted, the second "Add
        person" showed the first person's credentials instead of a blank form.
      */}
      {creating ? (
        <CreateUserDialog
          open
          onClose={() => setCreating(false)}
          projects={projects}
        />
      ) : null}
      <EditUserDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        row={editing}
      />
      {/*
        Mounted only while it is open, so every reset starts from a clean
        `useActionState`. Rendering it permanently and returning null for a
        missing row does NOT unmount it — the previous result survived, and
        reopening on a different person showed that person's email beside the
        previous person's password.
      */}
      {resetting ? (
        <ResetPasswordDialog
          open
          onClose={() => setResetting(null)}
          row={resetting}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this account?"
        description={
          deleting ? (
            <>
              <strong className="text-strong">{deleting.email}</strong> will lose
              access immediately. Backlinks they built stay in the project but
              become unassigned.
            </>
          ) : null
        }
        confirmLabel="Delete account"
        onConfirm={() => {
          if (!deleting) return;
          const fd = new FormData();
          fd.set("id", deleting.id);
          startTransition(async () => {
            await deleteUserAction(fd);
            setDeleting(null);
          });
        }}
      />
    </>
  );
}

/* ── Create ────────────────────────────────────────────────────── */

function CreateUserDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createUserAction, idle);
  const [role, setRole] = useState<UserRole>("SPECIALIST");
  const toast = useToast();

  const created = state.ok
    ? (state.data as { password: string; email: string } | undefined)
    : undefined;

  useEffect(() => {
    if (!state.ok && state.message && !state.errors) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Account created"
        description="Share these credentials over a secure channel — the password cannot be shown again."
        width="sm"
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="well space-y-3 p-4">
          <CredentialRow label="Email" value={created.email} />
          <CredentialRow label="Temporary password" value={created.password} mono />
          <p className="text-faint text-[11.5px]">
            They will be asked to set their own password on first sign-in.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title="Add a person"
      description="Team members work in the console. Clients get a read-only portal for one project."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="create-user" variant="primary" loading={pending}>
            Create account
          </Button>
        </>
      }
    >
      <form id="create-user" action={action} className="space-y-4 pb-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="name"
            required
            placeholder="Faseeh Ahmed"
            error={state.errors?.name}
            data-autofocus
          />
          <Input
            label="Email"
            name="email"
            type="email"
            required
            placeholder="faseeh@agency.com"
            error={state.errors?.email}
          />
        </div>

        <Select
          label="Role"
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          help={ROLE_DESCRIPTIONS[role]}
          options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          error={state.errors?.role}
        />

        {role === "CLIENT" ? (
          <Select
            label="Project this client can see"
            name="projectId"
            required
            placeholder="Choose a project…"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            error={state.errors?.projectId}
          />
        ) : (
          <Input
            label="Job title"
            name="title"
            placeholder="Link building specialist"
            error={state.errors?.title}
          />
        )}

        <Input
          label="Temporary password"
          name="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters, with a number"
          help="They are prompted to change it after signing in."
          error={state.errors?.password}
        />
      </form>
    </Dialog>
  );
}

/* ── Edit ──────────────────────────────────────────────────────── */

function EditUserDialog({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: UserRowData | null;
}) {
  const [state, action, pending] = useActionState(updateUserAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    } else if (!state.ok && state.message && !state.errors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!row) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={`Edit ${row.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-user" variant="primary" loading={pending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-user" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="id" value={row.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="name"
            required
            defaultValue={row.name}
            error={state.errors?.name}
            data-autofocus
          />
          <Input
            label="Email"
            name="email"
            type="email"
            required
            defaultValue={row.email}
            error={state.errors?.email}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Role"
            name="role"
            required
            defaultValue={row.role}
            options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
          <Input label="Job title" name="title" defaultValue={row.title ?? ""} />
        </div>
        <Input label="Phone" name="phone" defaultValue={row.phone ?? ""} />
        <Checkbox
          label="Account is active"
          description="Deactivating blocks sign-in immediately without deleting anything."
          name="isActive"
          defaultChecked={row.isActive}
        />
      </form>
    </Dialog>
  );
}

/* ── Reset password ────────────────────────────────────────────── */

function ResetPasswordDialog({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: UserRowData | null;
}) {
  const [state, action, pending] = useActionState(resetUserPasswordAction, idle);
  const toast = useToast();

  const result = state.ok ? (state.data as { password: string } | undefined) : undefined;

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!row) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="sm"
      title={result ? "Password reset" : `Reset password for ${row.name}`}
      description={
        result
          ? "Copy it now — it is hashed on save and cannot be retrieved later."
          : "Leave the field blank to generate a strong password automatically."
      }
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reset-password"
              variant="primary"
              loading={pending}
            >
              Reset password
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="well space-y-3 p-4">
          <CredentialRow label="Email" value={row.email} />
          <CredentialRow label="New password" value={result.password} mono />
        </div>
      ) : (
        <form id="reset-password" action={action} className="space-y-4 pb-2">
          <input type="hidden" name="id" value={row.id} />
          <Input
            label="New password"
            name="password"
            autoComplete="new-password"
            placeholder="Leave blank to generate one"
            error={state.errors?.password}
            data-autofocus
          />
        </form>
      )}
    </Dialog>
  );
}

function CredentialRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-faint mb-1 text-[11.5px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        <code
          className={`surface-raised flex-1 truncate rounded-lg px-2 py-1.5 text-[12.5px] ${mono ? "font-mono font-semibold" : ""}`}
        >
          {value}
        </code>
        <CopyButton size="md" value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}
