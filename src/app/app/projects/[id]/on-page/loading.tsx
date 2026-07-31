import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <ListPageSkeleton
      stats={4}
      filters={4}
      columns={13}
      label="Loading pages"
    />
  );
}
