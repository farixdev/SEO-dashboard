"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { PROJECT_MEMBER_ROLES } from "@/lib/constants";

import { addProjectMemberAction } from "./actions";

export function MemberManager({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: { id: string; name: string; email: string; role: string }[];
}) {
  const [state, action, pending] = useActionState(addProjectMemberAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!candidates.length) {
    return (
      <p className="text-faint text-[12.5px]">
        Everyone on the team already has access. Add new people from{" "}
        <span className="text-body font-medium">People &amp; access</span>.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 border-t pt-4"
      style={{ borderColor: "var(--line-soft)" }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <Select
        label="Add a team member"
        name="userId"
        required
        placeholder="Choose a person…"
        containerClassName="min-w-52 flex-1"
        options={candidates.map((c) => ({
          value: c.id,
          label: `${c.name} · ${c.email}`,
        }))}
        error={state.errors?.userId}
      />
      <Select
        label="Project role"
        name="role"
        defaultValue="SPECIALIST"
        containerClassName="w-44"
        options={PROJECT_MEMBER_ROLES.filter((r) => r !== "CLIENT_VIEWER").map((r) => ({
          value: r,
          label: r.charAt(0) + r.slice(1).toLowerCase(),
        }))}
      />
      <Button type="submit" variant="secondary" loading={pending}>
        <UserPlus className="size-4" />
        Add
      </Button>
    </form>
  );
}
