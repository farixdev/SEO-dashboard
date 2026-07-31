"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { logActivity } from "@/db/queries/projects";
import { projectMembers, projects, threads, users } from "@/db/schema";
import {
  type ActionState,
  describeError,
  fail,
  ok,
  parseForm,
} from "@/lib/action";
import {
  generatePassword,
  hashPassword,
  requireAdmin,
  requireStaff,
} from "@/lib/auth";
import { invalidate, invalidateProject, invalidateUsers } from "@/lib/cache";
import { slugify } from "@/lib/utils";
import {
  projectCreateSchema,
  projectMemberSchema,
  projectUpdateSchema,
} from "@/lib/validations";

/** Slugs must be unique; append -2, -3 … until one is free. */
async function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base) || "project";
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, candidate))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string; clientPassword?: string }>> {
  const user = await requireStaff();
  const parsed = parseForm(projectCreateSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  let projectId: string;
  let generatedPassword: string | undefined;
  let createdClientAccount = false;
  let linkedExistingClient = false;

  try {
    const slug = await uniqueSlug(input.name);

    const [project] = await db
      .insert(projects)
      .values({
        name: input.name,
        slug,
        websiteUrl: input.websiteUrl,
        clientCompany: input.clientCompany ?? null,
        country: input.country,
        status: input.status,
        startDate: input.startDate ?? null,
        monthlyBacklinkTarget: input.monthlyBacklinkTarget ?? 50,
        monthlyKeywordTarget: input.monthlyKeywordTarget ?? 5,
        monthlyContentTarget: input.monthlyContentTarget ?? 4,
        accentColor: input.accentColor ?? "indigo",
        notes: input.notes ?? null,
        createdById: user.id,
      })
      .returning({ id: projects.id });

    projectId = project.id;

    // The creator owns the project by default.
    await db.insert(projectMembers).values({
      projectId,
      userId: user.id,
      role: user.role === "ADMIN" ? "OWNER" : "MANAGER",
    });

    // Optional: provision the client login in the same step.
    if (input.clientEmail) {
      const email = input.clientEmail.toLowerCase();
      const [existing] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(sql`lower(${users.email})`, email))
        .limit(1);

      let clientUserId: string;
      if (existing) {
        /*
         * Reusing whatever account happens to own this address is how a
         * manager's own login, or another brand's client, ends up with
         * CLIENT_VIEWER rights on a project nobody meant to share. The form
         * returns no password in this branch either, so it looked like it had
         * worked. Only an existing client account may be re-used, and only if
         * it is not already somebody else's client.
         */
        if (existing.role !== "CLIENT") {
          return fail(
            `${input.clientEmail} is already a team account, not a client login. Use a different address for the client.`,
          );
        }
        const [otherProject] = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, existing.id),
              eq(projectMembers.role, "CLIENT_VIEWER"),
            ),
          )
          .limit(1);
        if (otherProject) {
          return fail(
            `${input.clientEmail} is already the client login for another project. Use a different address.`,
          );
        }
        clientUserId = existing.id;
        linkedExistingClient = true;
      } else {
        generatedPassword = input.clientPassword || generatePassword();
        const [created] = await db
          .insert(users)
          .values({
            email: input.clientEmail,
            name: input.clientName || input.clientCompany || input.name,
            passwordHash: await hashPassword(generatedPassword),
            role: "CLIENT",
            avatarColor: "sky",
            mustChangePassword: true,
          })
          .returning({ id: users.id });
        clientUserId = created.id;
        createdClientAccount = true;
      }

      await db
        .insert(projectMembers)
        .values({ projectId, userId: clientUserId, role: "CLIENT_VIEWER" })
        .onConflictDoNothing();
    }

    // Seed a welcome thread so the client has somewhere to reply.
    await db.insert(threads).values({
      projectId,
      subject: "Welcome — kicking off your SEO campaign",
      createdById: user.id,
    });

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "created",
      entity: "project",
      entityId: projectId,
      summary: `Created project “${input.name}”`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  // invalidate() always revalidates the project list, so the new card appears.
  invalidate(projectId, "threads");
  if (createdClientAccount || linkedExistingClient) invalidateUsers();

  revalidatePath("/app");
  return ok(
    linkedExistingClient
      ? "Project created. The existing client login was attached — send them an invite to set a password."
      : "Project created.",
    { id: projectId, clientPassword: generatedPassword },
  );
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(projectUpdateSchema, formData);
  if (!parsed.success) return fail("Check the fields below.", parsed.errors);

  const input = parsed.data;
  if (!user.projectIds.includes(input.id)) return fail("You cannot edit that project.");

  try {
    await db
      .update(projects)
      .set({
        name: input.name,
        websiteUrl: input.websiteUrl,
        clientCompany: input.clientCompany ?? null,
        country: input.country,
        status: input.status,
        startDate: input.startDate ?? null,
        monthlyBacklinkTarget: input.monthlyBacklinkTarget ?? 50,
        monthlyKeywordTarget: input.monthlyKeywordTarget ?? 5,
        monthlyContentTarget: input.monthlyContentTarget ?? 4,
        accentColor: input.accentColor ?? "indigo",
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.id));

    await logActivity({
      projectId: input.id,
      actorId: user.id,
      actorName: user.name,
      action: "updated",
      entity: "project",
      entityId: input.id,
      summary: `Updated project settings`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  // Name, status and targets are read by the list cards and every dashboard.
  invalidate(input.id);

  revalidatePath(`/app/projects/${input.id}`);
  revalidatePath("/app");
  return ok("Project saved.");
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (!id) return;

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  // Typing the project name is the guard against an accidental delete.
  if (!project || confirmName !== project.name) {
    redirect(`/app/projects/${id}/settings?error=name-mismatch`);
  }

  await db.delete(projects).where(eq(projects.id, id));
  await logActivity({
    actorId: user.id,
    actorName: user.name,
    action: "deleted",
    entity: "project",
    summary: `Deleted project “${project.name}” and all of its data`,
  });

  // The delete cascades to every child table, so every entity tag is stale.
  invalidateProject(id);

  revalidatePath("/app");
  redirect("/app");
}

/* ── Membership ────────────────────────────────────────────────── */

export async function addProjectMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(projectMemberSchema, formData);
  if (!parsed.success) return fail("Pick a person and a role.", parsed.errors);

  const { projectId, userId, role } = parsed.data;
  if (!user.projectIds.includes(projectId)) return fail("You cannot edit that project.");

  try {
    /*
     * The dropdown only ever offers staff, but the dropdown is not the
     * boundary — this action takes a user id and a role straight from the
     * form. Without these checks a client account can be attached to a second
     * project (which silently widens what their portal can read), or given a
     * staff seat on one.
     */
    const [target] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target) return fail("That account no longer exists.");

    if (target.role === "CLIENT") {
      if (role !== "CLIENT_VIEWER") {
        return fail("A client login cannot be given a team role.");
      }
      const [elsewhere] = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.userId, userId),
            eq(projectMembers.role, "CLIENT_VIEWER"),
            sql`${projectMembers.projectId} <> ${projectId}`,
          ),
        )
        .limit(1);
      if (elsewhere) {
        return fail("That client login already belongs to another project.");
      }
    } else if (role === "CLIENT_VIEWER") {
      return fail("A team account cannot be added as a client viewer.");
    }

    await db
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role },
      });

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "updated",
      entity: "project_member",
      summary: `Added a ${role.toLowerCase().replace("_", " ")} to the project`,
    });
  } catch (error) {
    return fail(describeError(error));
  }

  // Member and staff lists carry the project tag rather than an entity tag.
  invalidate(projectId);

  revalidatePath(`/app/projects/${projectId}/settings`);
  return ok("Team updated.");
}

export async function removeProjectMemberAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!projectId || !userId || !user.projectIds.includes(projectId)) return;

  const [removed] = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .returning({ role: projectMembers.role });

  if (removed) {
    const [account] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await logActivity({
      projectId,
      actorId: user.id,
      actorName: user.name,
      action: "deleted",
      entity: "project_member",
      entityId: userId,
      // For a client this removes their only project and leaves the portal
      // unusable, so it needs to be traceable.
      summary:
        removed.role === "CLIENT_VIEWER"
          ? `Removed the client login ${account?.email ?? userId} from the project`
          : `Removed ${account?.email ?? userId} from the project`,
    });
  }

  invalidate(projectId);

  revalidatePath(`/app/projects/${projectId}/settings`);
}
