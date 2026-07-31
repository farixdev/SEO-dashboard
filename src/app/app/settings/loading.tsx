import { FormSkeleton, HeaderSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  // Profile, password, then the access summary.
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <FormSkeleton sections={3} />
    </>
  );
}
