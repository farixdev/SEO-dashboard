import {
  HeaderSkeleton,
  MiniStatsSkeleton,
  Shimmer,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MiniStatsSkeleton count={4} />

      {/* Overall completion bar. */}
      <div className="panel mb-6 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-baseline justify-between">
          <Shimmer className="h-3.5 w-48" rounded="sm" />
          <Shimmer className="h-3 w-10" rounded="sm" />
        </div>
        <Shimmer className="h-2.5 w-full rounded-full" />
      </div>

      {/* One card per status column, each holding a two-up grid of tasks. */}
      <div className="space-y-6">
        {[4, 3, 4].map((cards, section) => (
          <div key={section} className="panel">
            <div className="space-y-2 px-5 pt-5 pb-4 sm:px-6">
              <Shimmer className="h-4 w-40" />
              <Shimmer className="h-3 w-56" />
            </div>
            <div className="grid gap-2 px-5 pb-5 sm:px-6 md:grid-cols-2">
              {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="well space-y-2.5 px-3.5 py-3">
                  <Shimmer className="h-3.5 w-3/4" rounded="sm" />
                  <Shimmer className="h-3 w-full" rounded="sm" />
                  <div className="flex items-center gap-2">
                    <Shimmer className="h-4 w-16 rounded-lg" />
                    <Shimmer className="size-6" rounded="full" />
                    <Shimmer className="h-3 w-20" rounded="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
