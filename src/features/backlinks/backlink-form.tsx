"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { BACKLINK_STATUSES, BACKLINK_TYPES } from "@/lib/constants";
import { idle } from "@/lib/action-state";

import { saveBacklinkAction } from "./actions";
import type { BacklinkRow } from "@/db/queries/backlinks";

export type AssigneeOption = { id: string; name: string };

export function BacklinkForm({
  open,
  onClose,
  projectId,
  row,
  assignees,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** null → create mode */
  row: BacklinkRow | null;
  assignees: AssigneeOption[];
  /** Whoever is adding the link — credited by default. */
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(saveBacklinkAction, idle);
  const toast = useToast();

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    } else if (!state.ok && state.message && !state.errors) {
      toast.error(state.message);
    }
    // Only react to a new submission result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      dismissOnBackdrop={false}
      title={row ? "Edit backlink" : "Add backlink"}
      description={
        row
          ? "Update the link record. Anchor text drives which keyword this link counts towards."
          : "Log a link the team built. Anchor text must match a tracked keyword for it to count towards that keyword's target."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="backlink-form"
            variant="primary"
            loading={pending}
          >
            {row ? "Save changes" : "Add backlink"}
          </Button>
        </>
      }
    >
      <form id="backlink-form" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="projectId" value={projectId} />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <Input
          label="Backlink URL"
          name="url"
          type="url"
          required
          placeholder="https://example.com/article-slug"
          defaultValue={row?.url ?? ""}
          error={state.errors?.url}
          data-autofocus
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Link type"
            name="type"
            required
            defaultValue={row?.type ?? "Guest Posts"}
            options={BACKLINK_TYPES.map((t) => ({ value: t, label: t }))}
            error={state.errors?.type}
          />
          <Select
            label="Status"
            name="status"
            required
            defaultValue={row?.status ?? "Published"}
            options={BACKLINK_STATUSES.map((s) => ({ value: s, label: s }))}
            error={state.errors?.status}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Anchor text 1"
            name="anchorText1"
            placeholder="digital marketing agency"
            hint="must match a keyword"
            defaultValue={row?.anchorText1 ?? ""}
            error={state.errors?.anchorText1}
          />
          <Input
            label="Anchor text 2"
            name="anchorText2"
            placeholder="optional second anchor"
            defaultValue={row?.anchorText2 ?? ""}
            error={state.errors?.anchorText2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Published date"
            name="publishedDate"
            type="date"
            help="Monthly reporting is derived from this date."
            defaultValue={row?.publishedDate ?? ""}
            error={state.errors?.publishedDate}
          />
          {/*
            Every link is somebody's work, and "Unassigned" was the default —
            so credit was lost by simply not touching the field, and the team
            performance table under-counted whoever built it. New links are
            credited to the person adding them; an existing link keeps whoever
            it already had. The list always contains you, even on a project you
            are not formally a member of, so the default is always selectable.
          */}
          <Select
            label="Built by"
            name="assigneeId"
            required
            defaultValue={row?.assigneeId ?? currentUserId}
            options={assignees.map((a) => ({ value: a.id, label: a.name }))}
            error={state.errors?.assigneeId}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="DA"
            name="da"
            type="number"
            min={0}
            max={100}
            step="1"
            placeholder="42"
            defaultValue={row?.da ?? ""}
            error={state.errors?.da}
          />
          <Input
            label="PA"
            name="pa"
            type="number"
            min={0}
            max={100}
            step="1"
            placeholder="49"
            defaultValue={row?.pa ?? ""}
            error={state.errors?.pa}
          />
          <Input
            label="Spam score"
            name="spamScore"
            type="number"
            min={0}
            max={100}
            step="1"
            placeholder="4"
            defaultValue={row?.spamScore ?? ""}
            error={state.errors?.spamScore}
          />
        </div>

        <Checkbox
          label="Indexed by Google"
          description="Only indexed links count towards a keyword's indexed total."
          name="indexed"
          defaultChecked={row?.indexed ?? false}
        />

        <fieldset
          className="well space-y-4 p-4"
          // Credentials are internal — the client portal never queries these columns.
        >
          <legend className="text-muted px-1 text-[11.5px] font-semibold tracking-wider uppercase">
            Internal login (never shown to the client)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Account / email used"
              name="loginUser"
              autoComplete="off"
              placeholder="team@agency.com"
              defaultValue={row?.loginUser ?? ""}
            />
            <Input
              label="Password"
              name="loginPassword"
              autoComplete="off"
              placeholder="stored for the team only"
              defaultValue={row?.loginPassword ?? ""}
            />
          </div>
        </fieldset>

        <Textarea
          label="Notes"
          name="notes"
          rows={2}
          placeholder="Anything the team should know about this placement."
          defaultValue={row?.notes ?? ""}
        />
      </form>
    </Dialog>
  );
}
