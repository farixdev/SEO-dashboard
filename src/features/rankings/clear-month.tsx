"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { monthLabelLong } from "@/lib/utils";

import { deleteMonthRankingsAction } from "./actions";

/**
 * Clears every recorded position for one month. The bulk grid can only blank
 * cells you can see, so this is the way out of a month pasted against the
 * wrong date.
 */
export function ClearMonthButton({
  projectId,
  month,
  recordedCount,
}: {
  projectId: string;
  month: string;
  recordedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (recordedCount === 0) return null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        Clear {monthLabelLong(month)}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        loading={pending}
        title={`Clear all positions for ${monthLabelLong(month)}?`}
        description={
          <>
            {recordedCount} recorded position{recordedCount === 1 ? "" : "s"} will be
            deleted. Other months are untouched, and the keywords themselves are
            kept.
          </>
        }
        confirmLabel="Clear the month"
        onConfirm={() => {
          const fd = new FormData();
          fd.set("projectId", projectId);
          fd.set("month", month);
          startTransition(async () => {
            await deleteMonthRankingsAction(fd);
            toast.success(`${monthLabelLong(month)} cleared.`);
            setOpen(false);
          });
        }}
      />
    </>
  );
}
