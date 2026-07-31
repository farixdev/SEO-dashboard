import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/misc";
import { ProjectForm } from "@/features/projects/project-form";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireStaff();

  return (
    <>
      <PageHeader
        title="New project"
        description="Set up a client website. You can add keywords, pages and links straight after — or import them from a spreadsheet."
        breadcrumb={
          <Link
            href="/app"
            className="text-faint hover:text-strong text-[12.5px] transition-colors"
          >
            ← All projects
          </Link>
        }
      />
      <ProjectForm row={null} />
    </>
  );
}
