"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { idle } from "@/lib/action-state";
import { PAGE_TYPES, SEO_SCORE_BUCKETS } from "@/lib/constants";

import { savePageAction } from "./actions";

export type PageFormRow = {
  id: string;
  title: string;
  targetUrl: string | null;
  focusKeyword: string | null;
  type: string;
  onPageDone: boolean;
  seoScore: string | null;
  indexed: boolean;
  wordCount: number | null;
  hasFaqs: boolean;
  hasBlogSection: boolean;
  hasReviewSection: boolean;
  hasCaseStudySection: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  notes: string | null;
};

export function PageForm({
  open,
  onClose,
  projectId,
  row,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  row: PageFormRow | null;
}) {
  const [state, action, pending] = useActionState(savePageAction, idle);
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
      width="lg"
      dismissOnBackdrop={false}
      title={row ? "Edit page" : "Add page"}
      description={
        row
          ? "Update the on-page audit for this URL."
          : "Add a page to the on-page audit. Keywords map to pages by title."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="page-form" variant="primary" loading={pending}>
            {row ? "Save changes" : "Add page"}
          </Button>
        </>
      }
    >
      <form id="page-form" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="projectId" value={projectId} />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Input
            label="Page title"
            name="title"
            required
            placeholder="Local SEO services"
            help="Must be unique within the project — keywords reference it by name."
            defaultValue={row?.title ?? ""}
            error={state.errors?.title}
            data-autofocus
          />
          <Select
            label="Page type"
            name="type"
            required
            defaultValue={row?.type ?? "Page"}
            options={PAGE_TYPES.map((t) => ({ value: t, label: t }))}
            error={state.errors?.type}
          />
        </div>

        <Input
          label="Target URL"
          name="targetUrl"
          type="url"
          placeholder="https://example.com/local-seo/"
          defaultValue={row?.targetUrl ?? ""}
          error={state.errors?.targetUrl}
        />

        <Input
          label="Focus keyword"
          name="focusKeyword"
          placeholder="local seo services"
          defaultValue={row?.focusKeyword ?? ""}
          error={state.errors?.focusKeyword}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="SEO score"
            name="seoScore"
            placeholder="Not scored"
            defaultValue={row?.seoScore ?? ""}
            options={SEO_SCORE_BUCKETS.map((s) => ({ value: s, label: s }))}
            error={state.errors?.seoScore}
          />
          <Input
            label="Word count"
            name="wordCount"
            type="number"
            min={0}
            step="1"
            placeholder="1004"
            defaultValue={row?.wordCount ?? ""}
            error={state.errors?.wordCount}
          />
        </div>

        <div className="well space-y-1 p-3">
          <p className="text-muted mb-1.5 px-1 text-[11.5px] font-semibold tracking-wider uppercase">
            Audit checklist
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            <Checkbox
              label="On-page optimisation done"
              name="onPageDone"
              defaultChecked={row?.onPageDone ?? false}
            />
            <Checkbox
              label="Indexed by Google"
              name="indexed"
              defaultChecked={row?.indexed ?? false}
            />
            <Checkbox
              label="FAQ section"
              name="hasFaqs"
              defaultChecked={row?.hasFaqs ?? false}
            />
            <Checkbox
              label="Blog / resources section"
              name="hasBlogSection"
              defaultChecked={row?.hasBlogSection ?? false}
            />
            <Checkbox
              label="Reviews / testimonials"
              name="hasReviewSection"
              defaultChecked={row?.hasReviewSection ?? false}
            />
            <Checkbox
              label="Case studies"
              name="hasCaseStudySection"
              defaultChecked={row?.hasCaseStudySection ?? false}
            />
          </div>
        </div>

        <Input
          label="Meta title"
          name="metaTitle"
          placeholder="Local SEO Services in Canada | Agency"
          hint="aim for 50–60 characters"
          defaultValue={row?.metaTitle ?? ""}
        />

        <Textarea
          label="Meta description"
          name="metaDescription"
          rows={2}
          hint="aim for 140–160 characters"
          defaultValue={row?.metaDescription ?? ""}
        />

        <Textarea
          label="Notes"
          name="notes"
          rows={2}
          placeholder="Outstanding on-page work, internal links to add, etc."
          defaultValue={row?.notes ?? ""}
        />
      </form>
    </Dialog>
  );
}
