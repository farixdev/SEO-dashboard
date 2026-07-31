"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

import { removeProjectMemberAction } from "./actions";

/**
 * Removing someone was a single unconfirmed click on a trash icon sitting one
 * button away from "Send invite", in a list where the client's own row looks
 * like everyone else's. For a client that click revokes the only project their
 * portal can read, so it asks first — and says plainly what it will do.
 */
export function RemoveMemberButton({
  projectId,
  userId,
  name,
  isSelf,
  isClient,
}: {
  projectId: string;
  userId: string;
  name: string;
  isSelf: boolean;
  isClient: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name} from this project`}
        disabled={isSelf || pending}
        title={isSelf ? "You cannot remove yourself" : "Remove from project"}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${name} from this project?`}
        description={
          isClient
            ? "This is the client's login. Removing it takes away their access to the portal immediately — they will be able to sign in, but will have nothing to see until they are added back."
            : "They keep their account and stay on any other projects. You can add them back at any time."
        }
        confirmLabel="Remove"
        loading={pending}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("projectId", projectId);
          fd.set("userId", userId);
          startTransition(async () => {
            await removeProjectMemberAction(fd);
            toast.success(`${name} was removed from the project.`);
            setConfirming(false);
          });
        }}
      />
    </>
  );
}
