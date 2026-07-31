import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <ListPageSkeleton
      stats={4}
      filters={3}
      columns={12}
      label="Loading keywords"
    />
  );
}
