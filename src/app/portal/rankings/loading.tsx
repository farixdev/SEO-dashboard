import {
  HeaderSkeleton,
  MiniStatsSkeleton,
  PaginationSkeleton,
  RankMatrixSkeleton,
  ToolbarSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MiniStatsSkeleton count={4} />
      <ToolbarSkeleton filters={3} />
      <RankMatrixSkeleton months={12} />
      <PaginationSkeleton />
    </>
  );
}
