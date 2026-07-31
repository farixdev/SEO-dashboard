import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { getClientProjectId, requireClient } from "@/lib/auth";

/**
 * Every portal page needs the same three things: the signed-in client, their
 * one project, and confirmation they are allowed to see it. Doing it in one
 * place keeps the authorisation check from drifting between pages.
 */
export async function requirePortalProject() {
  const user = await requireClient();

  /*
   * `/portal` runs this same guard, so sending a client with no project there
   * bounced the browser between the two until it gave up with
   * ERR_TOO_MANY_REDIRECTS — every portal page was unreachable. It happens for
   * real: deleting a project cascades away the client's membership row, and so
   * does removing them from the project's settings page. `/portal/no-project`
   * uses `requireClient()` only, so it is a destination that can actually be
   * reached.
   */
  const projectId = user.projectIds[0] ?? (await getClientProjectId(user.id));
  if (!projectId) redirect("/portal/no-project");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) redirect("/portal/no-project");

  return { user, project, projectId };
}
