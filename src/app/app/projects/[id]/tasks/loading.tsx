import {
  HeaderSkeleton,
  MiniStatsSkeleton,
  TaskBoardSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MiniStatsSkeleton count={4} />
      <TaskBoardSkeleton />
    </>
  );
}
