import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <ListPageSkeleton
      stats={4}
      filters={6}
      columns={11}
      label="Loading backlinks"
    />
  );
}
