import {
  ChartSkeleton,
  MiniStatsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <MiniStatsSkeleton count={4} />
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ChartSkeleton height={260} className="lg:col-span-2" />
        <ChartSkeleton height={260} />
      </div>
      <TableSkeleton columns={10} label="Loading analytics" />
    </>
  );
}
