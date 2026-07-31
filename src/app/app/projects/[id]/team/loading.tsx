import {
  ChartSkeleton,
  HeaderSkeleton,
  MiniStatsSkeleton,
  SidePanelSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <MiniStatsSkeleton count={5} />
      <div className="mb-6">
        <TableSkeleton rows={6} columns={9} label="Loading team performance" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartSkeleton height={260} className="lg:col-span-2" />
        <SidePanelSkeleton items={4} />
      </div>
    </>
  );
}
