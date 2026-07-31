import { HeaderSkeleton, Shimmer } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Entity tabs. */}
          <Shimmer className="h-10 w-96 rounded-2xl" />
          <div className="panel">
            <div className="space-y-2 px-5 pt-5 pb-4 sm:px-6">
              <Shimmer className="h-4 w-48" />
              <Shimmer className="h-3 w-80" />
            </div>
            <div className="space-y-4 px-5 pb-5 sm:px-6">
              {/* The paste area. */}
              <Shimmer className="h-64 w-full" />
              <div className="flex items-center justify-between">
                <Shimmer className="h-3 w-40" rounded="sm" />
                <Shimmer className="h-10 w-40 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          {[5, 5].map((rows, i) => (
            <div key={i} className="panel p-5">
              <Shimmer className="mb-4 h-4 w-36" />
              <div className="space-y-2">
                {Array.from({ length: rows }).map((_, r) => (
                  <Shimmer key={r} className="h-3.5 w-full" rounded="sm" />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
