import { HeaderSkeleton, MessagesSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <MessagesSkeleton />
    </>
  );
}
