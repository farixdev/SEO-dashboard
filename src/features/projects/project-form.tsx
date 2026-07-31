"use client";

import { CheckCircle2, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { AVATAR_COLORS, COUNTRIES, PROJECT_STATUSES } from "@/lib/constants";

import { createProjectAction, updateProjectAction } from "./actions";

export type ProjectFormRow = {
  id: string;
  name: string;
  websiteUrl: string;
  clientCompany: string | null;
  country: string;
  status: string;
  startDate: string | null;
  monthlyBacklinkTarget: number;
  monthlyKeywordTarget: number;
  monthlyContentTarget: number;
  accentColor: string;
  notes: string | null;
};

export function ProjectForm({ row }: { row: ProjectFormRow | null }) {
  const isEdit = row !== null;
  const [state, action, pending] = useActionState(
    isEdit ? updateProjectAction : createProjectAction,
    idle,
  );
  const [withClient, setWithClient] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const created = state.ok
    ? (state.data as { id?: string; clientPassword?: string } | undefined)
    : undefined;

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      // When a client password was generated we keep the page so it can be
      // copied; otherwise go straight into the new project.
      if (!isEdit && created?.id && !created.clientPassword) {
        router.push(`/app/projects/${created.id}`);
      }
    } else if (!state.ok && state.message && !state.errors) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!isEdit && created?.id && created.clientPassword) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardBody className="pt-6">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--color-mint-500)_18%,transparent)] text-[var(--color-mint-600)]">
            <CheckCircle2 className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">Project created</h2>
          <p className="text-muted mt-2 text-[13.5px] leading-5">
            The client login is ready. Copy the password now — it is hashed on
            save and cannot be shown again.
          </p>

          <div className="well mt-5 space-y-3 p-4">
            <div>
              <p className="text-faint mb-1 text-[11.5px] font-semibold tracking-wider uppercase">
                Portal URL
              </p>
              <div className="flex items-center gap-1.5">
                <code className="surface-raised flex-1 truncate rounded-lg px-2 py-1.5 font-mono text-[12px]">
                  {typeof window !== "undefined" ? window.location.origin : ""}/login
                </code>
                <CopyButton
                  size="md"
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/login`}
                  label="Copy portal URL"
                />
              </div>
            </div>
            <div>
              <p className="text-faint mb-1 text-[11.5px] font-semibold tracking-wider uppercase">
                Temporary password
              </p>
              <div className="flex items-center gap-1.5">
                <code className="surface-raised flex-1 rounded-lg px-2 py-1.5 font-mono text-[13px] font-semibold">
                  {created.clientPassword}
                </code>
                <CopyButton
                  size="md"
                  value={created.clientPassword}
                  label="Copy password"
                />
              </div>
              <p className="text-faint mt-1.5 text-[11.5px]">
                The client is asked to change it on first sign-in.
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Button
              variant="primary"
              onClick={() => router.push(`/app/projects/${created.id}`)}
            >
              Open the project
            </Button>
            <Button variant="ghost" onClick={() => router.push("/app")}>
              All projects
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <form action={action} className="mx-auto max-w-3xl space-y-6">
      {isEdit ? <input type="hidden" name="id" value={row.id} /> : null}

      <Card>
        <CardHeader
          title="Project details"
          description="One project per client website. Everything else lives inside it."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Project name"
              name="name"
              required
              placeholder="Mindcob"
              defaultValue={row?.name ?? ""}
              error={state.errors?.name}
              data-autofocus
            />
            <Input
              label="Client company"
              name="clientCompany"
              placeholder="Mindcob Inc."
              defaultValue={row?.clientCompany ?? ""}
              error={state.errors?.clientCompany}
            />
          </div>

          <Input
            label="Website URL"
            name="websiteUrl"
            type="url"
            required
            placeholder="https://mindcob.com"
            defaultValue={row?.websiteUrl ?? ""}
            error={state.errors?.websiteUrl}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Target country"
              name="country"
              required
              defaultValue={row?.country ?? "Canada"}
              options={COUNTRIES.map((c) => ({ value: c, label: c }))}
              error={state.errors?.country}
            />
            <Select
              label="Status"
              name="status"
              defaultValue={row?.status ?? "ACTIVE"}
              options={PROJECT_STATUSES.map((s) => ({
                value: s,
                label: s.charAt(0) + s.slice(1).toLowerCase(),
              }))}
            />
            <Input
              label="Campaign start"
              name="startDate"
              type="date"
              defaultValue={row?.startDate ?? ""}
            />
          </div>

          <Select
            label="Accent colour"
            name="accentColor"
            defaultValue={row?.accentColor ?? "indigo"}
            help="Used on the project's cards and charts."
            options={AVATAR_COLORS.map((c) => ({
              value: c,
              label: c.charAt(0).toUpperCase() + c.slice(1),
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Monthly targets"
          description="Progress rings on both dashboards measure against these."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Backlinks / month"
              name="monthlyBacklinkTarget"
              type="number"
              min={0}
              step="1"
              defaultValue={row?.monthlyBacklinkTarget ?? 50}
              error={state.errors?.monthlyBacklinkTarget}
            />
            <Input
              label="Page-1 keywords"
              name="monthlyKeywordTarget"
              type="number"
              min={0}
              step="1"
              defaultValue={row?.monthlyKeywordTarget ?? 5}
              error={state.errors?.monthlyKeywordTarget}
            />
            <Input
              label="Content pieces / month"
              name="monthlyContentTarget"
              type="number"
              min={0}
              step="1"
              defaultValue={row?.monthlyContentTarget ?? 4}
              error={state.errors?.monthlyContentTarget}
            />
          </div>
        </CardBody>
      </Card>

      {!isEdit ? (
        <Card>
          <CardHeader
            title="Client portal access"
            description="Optional — you can also add client logins later from People & access."
            icon={<KeyRound className="size-4" />}
          />
          <CardBody className="space-y-4">
            <Checkbox
              label="Create a client login now"
              description="They get a read-only portal for this project, plus messaging."
              checked={withClient}
              onChange={(e) => setWithClient(e.target.checked)}
            />

            {withClient ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Client contact name"
                  name="clientName"
                  placeholder="Sarah Chen"
                  error={state.errors?.clientName}
                />
                <Input
                  label="Client email"
                  name="clientEmail"
                  type="email"
                  required
                  placeholder="sarah@mindcob.com"
                  error={state.errors?.clientEmail}
                />
                <Input
                  label="Password"
                  name="clientPassword"
                  placeholder="Leave blank to generate one"
                  help="A strong password is generated if you leave this empty."
                  containerClassName="sm:col-span-2"
                  error={state.errors?.clientPassword}
                />
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Internal notes" description="Only the agency team sees this." />
        <CardBody>
          <Textarea
            name="notes"
            rows={3}
            placeholder="Scope, retainer, contacts, anything the team should know."
            defaultValue={row?.notes ?? ""}
          />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {isEdit ? "Save project" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
