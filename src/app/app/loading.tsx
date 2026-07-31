import {
  HeaderSkeleton,
  ProjectCardsSkeleton,
  SidePanelSkeleton,
  StatCardsSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      {/* The links tile carries a progress bar, which sets the row height. */}
      <StatCardsSkeleton count={4} withChart />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <ProjectCardsSkeleton count={4} />
        </section>
        <aside className="space-y-4">
          <SidePanelSkeleton items={4} />
          <SidePanelSkeleton items={5} />
        </aside>
      </div>
    </>
  );
}
