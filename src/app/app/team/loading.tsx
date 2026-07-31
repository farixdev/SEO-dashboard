import {
  ChartSkeleton,
  HeaderSkeleton,
  MiniStatsSkeleton,
  Shimmer,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MiniStatsSkeleton count={4} />
      <div className="mb-4 flex justify-end">
        <Shimmer className="h-10 w-32 rounded-2xl" />
      </div>
      <TableSkeleton rows={8} columns={6} label="Loading accounts" />
      {/* "What each role can do" reference card. */}
      <div className="mt-6">
        <ChartSkeleton height={150} />
      </div>
    </>
  );
}
