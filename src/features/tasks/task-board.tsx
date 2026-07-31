"use client";

import {
  AlertTriangle,
  CalendarClock,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { TaskRow } from "@/db/queries/tasks";
import { idle } from "@/lib/action-state";
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

import { deleteTaskAction, moveTaskAction, saveTaskAction } from "./actions";

export type StaffOption = { id: string; name: string; avatarColor: string | null };

const PRIORITY_TONES: Record<string, BadgeTone> = {
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "muted",
};

export function TaskBoard({
  projectId,
  columns,
  staff,
  canEdit,
}: {
  projectId: string;
  columns: { status: TaskStatus; tasks: TaskRow[] }[];
  staff: StaffOption[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-4">
        {columns.map((column) => (
          <section key={column.status} className="flex min-w-0 flex-col">
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <h2 className="text-muted text-[11.5px] font-semibold tracking-[0.08em] uppercase">
                {TASK_STATUS_LABELS[column.status]}
                <span className="text-faint ml-1.5 font-normal">
                  {column.tasks.length}
                </span>
              </h2>
              {canEdit ? (
                <button
                  onClick={() => setCreatingIn(column.status)}
                  aria-label={`Add task to ${TASK_STATUS_LABELS[column.status]}`}
                  className="text-faint hover:text-strong rounded-lg p-1 transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <Plus className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="well flex min-h-32 flex-1 flex-col gap-2 p-2">
              {column.tasks.length === 0 ? (
                <p className="text-faint px-2 py-6 text-center text-[12px]">
                  Nothing here
                </p>
              ) : (
                column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    canEdit={canEdit}
                    onEdit={() => setEditing(task)}
                    onDelete={() => setDeleting(task)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      {canEdit ? (
        <>
          <TaskForm
            open={creatingIn !== null}
            onClose={() => setCreatingIn(null)}
            projectId={projectId}
            staff={staff}
            row={null}
            defaultStatus={creatingIn ?? "BACKLOG"}
          />
          <TaskForm
            open={editing !== null}
            onClose={() => setEditing(null)}
            projectId={projectId}
            staff={staff}
            row={editing}
            defaultStatus={(editing?.status as TaskStatus) ?? "BACKLOG"}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => setDeleting(null)}
            title="Delete this task?"
            description={deleting?.title}
            confirmLabel="Delete task"
            onConfirm={() => {
              if (!deleting) return;
              const fd = new FormData();
              fd.set("id", deleting.id);
              fd.set("projectId", projectId);
              void deleteTaskAction(fd);
              setDeleting(null);
            }}
          />
        </>
      ) : null}
    </>
  );
}

function TaskCard({
  task,
  projectId,
  canEdit,
  onEdit,
  onDelete,
}: {
  task: TaskRow;
  projectId: string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [, startTransition] = useTransition();
  const overdue =
    task.status !== "DONE" && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <article className="panel-sm group p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-strong min-w-0 flex-1 text-[13px] leading-[1.4] font-medium">
          {task.title}
        </p>
        {canEdit ? (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={onEdit}
              aria-label="Edit task"
              className="text-faint hover:text-strong rounded p-1 transition-colors"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete task"
              className="text-faint hover:text-[var(--color-rose-600)] rounded p-1 transition-colors"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ) : null}
      </div>

      {task.description ? (
        <p className="text-muted mt-1.5 line-clamp-2 text-[12px] leading-[1.45]">
          {task.description}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONES[task.priority] ?? "neutral"}>
          {task.priority.toLowerCase()}
        </Badge>
        <Badge tone="neutral">
          {TASK_CATEGORY_LABELS[task.category as keyof typeof TASK_CATEGORY_LABELS] ??
            task.category}
        </Badge>
        {task.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              overdue ? "font-medium text-[var(--color-rose-600)]" : "text-faint",
            )}
          >
            {overdue ? (
              <AlertTriangle className="size-3" />
            ) : (
              <CalendarClock className="size-3" />
            )}
            {formatDate(task.dueDate)}
          </span>
        ) : null}
        {canEdit ? (
          <span
            className="text-faint ml-auto inline-flex items-center"
            title={task.clientVisible ? "Visible to the client" : "Internal only"}
          >
            {task.clientVisible ? (
              <Eye className="size-3" />
            ) : (
              <EyeOff className="size-3" />
            )}
          </span>
        ) : null}
      </div>

      <div
        className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5"
        style={{ borderColor: "var(--line-soft)" }}
      >
        {task.assigneeName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={task.assigneeName} color={task.assigneeColor} size="xs" />
            <span className="text-muted truncate text-[11.5px]">
              {task.assigneeName}
            </span>
          </span>
        ) : (
          <span className="text-faint text-[11.5px]">Unassigned</span>
        )}

        {canEdit ? (
          <form
            action={(fd) => {
              startTransition(() => {
                void moveTaskAction(fd);
              });
            }}
          >
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <select
              name="status"
              defaultValue={task.status}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label={`Move “${task.title}”`}
              className="surface-sunken text-muted h-6 cursor-pointer rounded-md px-1 text-[11px] focus:outline-none"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function TaskForm({
  open,
  onClose,
  projectId,
  staff,
  row,
  defaultStatus,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  staff: StaffOption[];
  row: TaskRow | null;
  defaultStatus: TaskStatus;
}) {
  const [state, action, pending] = useActionState(saveTaskAction, idle);
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
      title={row ? "Edit task" : "New task"}
      description="Tasks marked client-visible appear on the client's progress page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" variant="primary" loading={pending}>
            {row ? "Save changes" : "Create task"}
          </Button>
        </>
      }
    >
      <form id="task-form" action={action} className="space-y-4 pb-2">
        <input type="hidden" name="projectId" value={projectId} />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <Input
          label="Title"
          name="title"
          required
          placeholder="Rewrite the Local SEO service page intro"
          defaultValue={row?.title ?? ""}
          error={state.errors?.title}
          data-autofocus
        />

        <Textarea
          label="Description"
          name="description"
          rows={3}
          placeholder="What needs to happen, and what does done look like?"
          defaultValue={row?.description ?? ""}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Status"
            name="status"
            defaultValue={row?.status ?? defaultStatus}
            options={TASK_STATUSES.map((s) => ({
              value: s,
              label: TASK_STATUS_LABELS[s],
            }))}
          />
          <Select
            label="Priority"
            name="priority"
            defaultValue={row?.priority ?? "MEDIUM"}
            options={TASK_PRIORITIES.map((p) => ({
              value: p,
              label: p.charAt(0) + p.slice(1).toLowerCase(),
            }))}
          />
          <Select
            label="Category"
            name="category"
            defaultValue={row?.category ?? "OTHER"}
            options={TASK_CATEGORIES.map((c) => ({
              value: c,
              label: TASK_CATEGORY_LABELS[c],
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Assignee"
            name="assigneeId"
            placeholder="Unassigned"
            defaultValue={row?.assigneeId ?? ""}
            options={staff.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Input
            label="Due date"
            name="dueDate"
            type="date"
            defaultValue={row?.dueDate ?? ""}
          />
        </div>

        <Checkbox
          label="Show this task to the client"
          description="Uncheck for internal work the client does not need to see."
          name="clientVisible"
          defaultChecked={row?.clientVisible ?? true}
        />
      </form>
    </Dialog>
  );
}
