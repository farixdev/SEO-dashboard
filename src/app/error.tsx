"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  const isDbConfig = /DATABASE_URL|AUTH_SECRET/i.test(error.message);

  return (
    <main className="surface-app grid min-h-dvh place-items-center p-6">
      <div className="panel w-full max-w-lg p-8">
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--color-amber-500)_18%,transparent)] text-[var(--color-amber-600)]">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">
          {isDbConfig ? "Setup not finished" : "Something went wrong"}
        </h1>

        {isDbConfig ? (
          <div className="text-muted mt-3 space-y-3 text-[13.5px] leading-6">
            <p>
              The app cannot reach its database yet. Add your Neon connection
              string to <code className="surface-sunken rounded px-1">.env.local</code>{" "}
              and run the setup command:
            </p>
            <pre className="well overflow-x-auto p-3 font-mono text-[12px]">
              npm run setup
            </pre>
          </div>
        ) : (
          <p className="text-muted mt-3 text-[13.5px] leading-5">
            An unexpected error interrupted this page. Retrying usually fixes it.
          </p>
        )}

        {error.digest ? (
          <p className="text-faint mt-4 font-mono text-[11.5px]">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Link href="/app">
            <Button variant="ghost">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
