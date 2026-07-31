"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

import { deleteProjectAction } from "./actions";

export function DangerZone({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation.trim() === projectName;

  return (
    <Card className="border border-[color-mix(in_oklab,var(--color-rose-500)_28%,transparent)]">
      <CardHeader
        title="Delete this project"
        description="Removes the project and every keyword, page, backlink, ranking, task and message inside it. This cannot be undone."
        icon={<AlertTriangle className="size-4" />}
      />
      <CardBody>
        <form action={deleteProjectAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={projectId} />
          <Input
            label="Type the project name to confirm"
            name="confirmName"
            placeholder={projectName}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            containerClassName="min-w-56 flex-1"
            autoComplete="off"
          />
          <Button type="submit" variant="danger" disabled={!matches}>
            Delete permanently
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
