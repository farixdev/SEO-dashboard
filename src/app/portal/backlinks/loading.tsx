import {
  ChartSkeleton,
  HeaderSkeleton,
  MiniStatsSkeleton,
  PaginationSkeleton,
  TableSkeleton,
  ToolbarSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MiniStatsSkeleton count={4} />
      {/* Link-quality donut sits above the table on the portal. */}
      <ChartSkeleton height={180} className="mb-5" />
      <ToolbarSkeleton filters={3} />
      {/* Credential and owner columns are staff-only, so the client sees fewer. */}
      <TableSkeleton rows={12} columns={9} label="Loading backlinks" />
      <PaginationSkeleton />
    </>
  );
}
