"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { KEYWORD_INTENTS } from "@/lib/constants";

import { saveKeywordAction } from "./actions";

export type PageOption = { id: string; title: string; type: string };

export type KeywordFormRow = {
  id: string;
  keyword: string;
  intent: string | null;
  volume: number | null;
  kd: number | null;
  cpc: string | null;
  competition: number | null;
  ads: number | null;
  pageId: string | null;
  priority: boolean;
  backlinkTarget: number;
  monthlyTarget: number | null;
};

export function KeywordForm({
  open,
  onClose,
  projectId,
  row,
  pageOptions,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  row: KeywordFormRow | null;
  pageOptions: PageOption[];
}) {
  const [state, action, pending] = useActionState(saveKeywordAction, idle);
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={row ? "Edit keyword" : "Add keyword"}
      description={
        row
          ? "Update the keyword's metrics and the page it targets."
          : "Add a keyword to track. Map it to a page so on-page work and rankings line up."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="keyword-form" variant="primary" loading={pending}>
            {row ? "Save changes" : "Add keyword"}
          </Button>
        </>
      }
    >
      <form id="keyword-form" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="projectId" value={projectId} />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <Input
          label="Keyword"
          name="keyword"
          required
          placeholder="local seo services canada"
          defaultValue={row?.keyword ?? ""}
          error={state.errors?.keyword}
          data-autofocus
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Search intent"
            name="intent"
            placeholder="Unclassified"
            defaultValue={row?.intent ?? ""}
            options={KEYWORD_INTENTS.map((i) => ({ value: i, label: i }))}
            error={state.errors?.intent}
          />
          <Select
            label="Target page"
            name="pageId"
            placeholder="Not mapped yet"
            defaultValue={row?.pageId ?? ""}
            help="Target URL and focus keyword come from the page."
            options={pageOptions.map((p) => ({
              value: p.id,
              label: `${p.title} · ${p.type}`,
            }))}
            error={state.errors?.pageId}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Search volume"
            name="volume"
            type="number"
            min={0}
            step="1"
            placeholder="170"
            hint="monthly"
            defaultValue={row?.volume ?? ""}
            error={state.errors?.volume}
          />
          <Input
            label="Difficulty (KD)"
            name="kd"
            type="number"
            min={0}
            max={100}
            step="1"
            placeholder="23"
            defaultValue={row?.kd ?? ""}
            error={state.errors?.kd}
          />
          <Input
            label="CPC"
            name="cpc"
            type="number"
            min={0}
            step="0.01"
            placeholder="4.53"
            leading="$"
            defaultValue={row?.cpc ?? ""}
            error={state.errors?.cpc}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Backlink target"
            name="backlinkTarget"
            type="number"
            min={0}
            step="1"
            placeholder="10"
            help="Progress % is measured against this."
            defaultValue={row?.backlinkTarget ?? 0}
            error={state.errors?.backlinkTarget}
          />
          <Input
            label="Monthly link target"
            name="monthlyTarget"
            type="number"
            min={0}
            step="1"
            placeholder="5"
            defaultValue={row?.monthlyTarget ?? ""}
            error={state.errors?.monthlyTarget}
          />
        </div>

        <Checkbox
          label="Priority keyword"
          description="Priority keywords sort to the top of the rank grid and client reports."
          name="priority"
          defaultChecked={row?.priority ?? false}
        />
      </form>
    </Dialog>
  );
}
