import { FormSkeleton, HeaderSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  // Profile, password, then the read-only campaign summary.
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <FormSkeleton sections={3} />
    </>
  );
}
