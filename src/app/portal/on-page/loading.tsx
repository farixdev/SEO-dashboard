import { HeaderSkeleton, ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      {/* Read-only view: no select or actions column. */}
      <ListPageSkeleton stats={4} filters={2} columns={12} label="Loading pages" />
    </>
  );
}
