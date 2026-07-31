import {
  ChartSkeleton,
  HeaderSkeleton,
  MiniStatsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <MiniStatsSkeleton count={4} />
      {/* "What these numbers mean" explainer card. */}
      <ChartSkeleton height={90} className="mb-6" />
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ChartSkeleton height={280} className="lg:col-span-2" />
        <ChartSkeleton height={200} />
      </div>
      <TableSkeleton rows={10} columns={9} label="Loading monthly search data" />
    </>
  );
}
