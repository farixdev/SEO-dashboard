import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { requireClient } from "@/lib/auth";

export const metadata: Metadata = { title: "No project linked" };

/**
 * Where a client lands when their account is not attached to a project —
 * usually because the project was deleted, or their access was revoked.
 *
 * This page deliberately uses `requireClient()` and NOT `requirePortalProject()`.
 * That guard used to send this case to `/portal`, which runs the same guard,
 * so the browser bounced between the two until it gave up with
 * ERR_TOO_MANY_REDIRECTS and the client could not reach any page at all.
 */
export default async function NoProjectPage() {
  const user = await requireClient();

  return (
    <Card>
      <EmptyState
        icon={<LifeBuoy className="size-6" />}
        title="No project linked to your account yet"
        description={`You are signed in as ${user.email}, but your account is not attached to a project right now. Your account manager can restore access — please get in touch with them.`}
      />
    </Card>
  );
}
