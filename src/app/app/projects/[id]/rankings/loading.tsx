import {
  MiniStatsSkeleton,
  PaginationSkeleton,
  RankMatrixSkeleton,
  Shimmer,
  ToolbarSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      {/* Mode switch + import button row. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Shimmer className="h-10 w-64 rounded-2xl" />
        <Shimmer className="h-8 w-56 rounded-xl" />
      </div>
      <MiniStatsSkeleton count={5} />
      <ToolbarSkeleton filters={3} />
      <RankMatrixSkeleton months={12} />
      <PaginationSkeleton />
    </>
  );
}
