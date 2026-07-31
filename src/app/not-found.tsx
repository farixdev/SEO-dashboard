import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="surface-app grid min-h-dvh place-items-center p-6">
      <div className="panel w-full max-w-md p-8 text-center">
        <div className="well text-faint mx-auto mb-5 grid size-14 place-items-center rounded-2xl">
          <FileQuestion className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-muted mt-2 text-[13.5px] leading-5">
          The page you are looking for was moved, deleted, or never existed.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/app">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
