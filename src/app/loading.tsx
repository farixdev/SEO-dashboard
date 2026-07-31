import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-faint flex items-center gap-2.5 text-[13px]">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    </div>
  );
}
