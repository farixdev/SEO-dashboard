import { PageHeader } from "@/components/ui/misc";
import { ImportPanel } from "@/features/import/import-panel";
import { requireProjectAccess } from "@/lib/auth";
import { requireStaff } from "@/lib/auth";

const ENTITIES = ["backlinks", "keywords", "pages", "analytics", "rankings"] as const;
type Entity = (typeof ENTITIES)[number];

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { id } = await params;
  const { entity } = await searchParams;
  await requireStaff();
  await requireProjectAccess(id);

  const defaultEntity = ENTITIES.includes(entity as Entity)
    ? (entity as Entity)
    : "backlinks";

  return (
    <>
      <PageHeader
        title="Import data"
        description="Move your spreadsheet in. Paste rows straight from Excel or Google Sheets — headers are matched to the sheet names you already use."
      />
      <ImportPanel projectId={id} defaultEntity={defaultEntity} />
    </>
  );
}
