import { FormSkeleton, HeaderSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton withAction={false} />
      <FormSkeleton sections={4} />
    </>
  );
}
