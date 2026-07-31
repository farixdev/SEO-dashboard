import {
  DashboardChartsSkeleton,
  HeaderSkeleton,
  MiniStatsSkeleton,
  StatCardsSkeleton,
  TargetRingsSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <StatCardsSkeleton count={4} />
      {/* The "where things stand" card: two progress rings beside the insights. */}
      <TargetRingsSkeleton />
      <DashboardChartsSkeleton />
      <div className="mt-6">
        <MiniStatsSkeleton count={4} />
      </div>
    </>
  );
}
