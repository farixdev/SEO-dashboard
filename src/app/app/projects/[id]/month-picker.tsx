"use client";

import { CalendarDays } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { monthLabelLong } from "@/lib/utils";

export function MonthPicker({
  months,
  current,
  basePath,
  paramName = "month",
}: {
  months: string[];
  current: string;
  basePath: string;
  paramName?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <label className="well inline-flex items-center gap-2 px-3 py-2">
      <CalendarDays
        className={`text-faint size-4 shrink-0 ${pending ? "animate-pulse" : ""}`}
      />
      <span className="sr-only">Reporting month</span>
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(search.toString());
          next.set(paramName, e.target.value);
          startTransition(() => router.replace(`${basePath}?${next.toString()}`));
        }}
        className="text-body cursor-pointer appearance-none bg-transparent pr-1 text-[13px] font-medium focus:outline-none"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabelLong(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
