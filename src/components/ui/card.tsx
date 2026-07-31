import type { ReactNode } from "react";

import { InfoHint } from "@/components/ui/info-hint";
import { type HelpEntry } from "@/lib/help";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  as: Tag = "div",
  flat = false,
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
  flat?: boolean;
}) {
  return (
    <Tag className={cn(flat ? "panel-flat" : "panel", className)}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
  help,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
  /** Shows a ⓘ beside the section title explaining what feeds it. */
  help?: HelpEntry;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] leading-6 font-semibold">
            <span className="truncate">{title}</span>
            {help ? <InfoHint help={help} /> : null}
          </h2>
          {description ? (
            <p className="text-muted mt-0.5 text-[13px] leading-5">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 pb-5 sm:px-6", className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6",
        className,
      )}
      style={{ borderColor: "var(--line-soft)" }}
    >
      {children}
    </div>
  );
}
