import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  // Read-only view: no select or actions column.
  return (
    <ListPageSkeleton
      stats={4}
      filters={3}
      columns={11}
      label="Loading keywords"
    />
  );
}
