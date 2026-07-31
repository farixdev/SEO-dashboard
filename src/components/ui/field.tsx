"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

const CONTROL = cn(
  "w-full rounded-xl px-3 py-2 text-sm",
  "surface-sunken text-strong shadow-[var(--inset-well)]",
  "placeholder:text-[var(--text-faint)]",
  "border border-transparent",
  "transition-shadow duration-150",
  "focus:border-[var(--accent)] focus:outline-none",
  "focus:ring-2 focus:ring-[var(--accent-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-[var(--color-rose-500)]",
);

export function Label({
  children,
  htmlFor,
  hint,
  required,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "text-body mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium",
        className,
      )}
    >
      <span>
        {children}
        {required ? (
          <span className="ml-0.5 text-[var(--color-rose-500)]" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      {hint ? <span className="text-faint text-[11.5px] font-normal">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-[12px] text-[var(--color-rose-600)] dark:text-[var(--color-rose-500)]">
      {children}
    </p>
  );
}

export function FieldHelp({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="text-faint mt-1.5 text-[12px] leading-4">{children}</p>;
}

/* ── Input ─────────────────────────────────────────────────────── */

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: ReactNode;
  error?: string;
  help?: ReactNode;
  hint?: ReactNode;
  containerClassName?: string;
  /** Static adornment inside the field — a currency symbol, "https://", etc. */
  leading?: ReactNode;
}

export function Input({
  label,
  error,
  help,
  hint,
  className,
  containerClassName,
  leading,
  id,
  required,
  ...props
}: InputProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={containerClassName}>
      {label ? (
        <Label htmlFor={fieldId} hint={hint} required={required}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        {leading ? (
          <span className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
            {leading}
          </span>
        ) : null}
        <input
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(CONTROL, leading && "pl-8", className)}
          {...props}
        />
      </div>
      {error ? (
        <p
          id={`${fieldId}-error`}
          className="mt-1.5 text-[12px] text-[var(--color-rose-600)] dark:text-[var(--color-rose-500)]"
        >
          {error}
        </p>
      ) : (
        <FieldHelp>{help}</FieldHelp>
      )}
    </div>
  );
}

/* ── Textarea ──────────────────────────────────────────────────── */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  help?: ReactNode;
  hint?: ReactNode;
  containerClassName?: string;
}

export function Textarea({
  label,
  error,
  help,
  hint,
  className,
  containerClassName,
  id,
  required,
  ...props
}: TextareaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={containerClassName}>
      {label ? (
        <Label htmlFor={fieldId} hint={hint} required={required}>
          {label}
        </Label>
      ) : null}
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "min-h-[88px] resize-y leading-6", className)}
        {...props}
      />
      {error ? <FieldError>{error}</FieldError> : <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

/* ── Select ────────────────────────────────────────────────────── */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  help?: ReactNode;
  hint?: ReactNode;
  containerClassName?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  help,
  hint,
  className,
  containerClassName,
  options,
  placeholder,
  children,
  id,
  required,
  ...props
}: SelectProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={containerClassName}>
      {label ? (
        <Label htmlFor={fieldId} hint={hint} required={required}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        <select
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL, "appearance-none pr-9", className)}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <svg
          className="text-faint pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {error ? <FieldError>{error}</FieldError> : <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

/* ── Checkbox / Switch ─────────────────────────────────────────── */

export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "group flex cursor-pointer items-start gap-2.5 rounded-xl px-1 py-1.5",
        "hover:bg-[var(--surface-hover)]",
        className,
      )}
    >
      <input
        id={fieldId}
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-md",
          "surface-sunken shadow-[var(--inset-well)]",
          "checked:bg-[var(--accent)] checked:shadow-none",
          "relative transition-colors",
          "checked:after:absolute checked:after:inset-0 checked:after:m-auto",
          "checked:after:h-[7px] checked:after:w-[3.5px]",
          "checked:after:rotate-45 checked:after:border-r-2 checked:after:border-b-2",
          "checked:after:border-[var(--on-accent)] checked:after:content-['']",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none",
        )}
        {...props}
      />
      <span className="min-w-0">
        <span className="text-body block text-[13px] leading-5 font-medium">
          {label}
        </span>
        {description ? (
          <span className="text-faint block text-[12px] leading-4">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Switch({
  label,
  description,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label
      htmlFor={fieldId}
      className={cn("flex cursor-pointer items-center justify-between gap-4", className)}
    >
      <span className="min-w-0">
        <span className="text-body block text-[13px] font-medium">{label}</span>
        {description ? (
          <span className="text-faint block text-[12px] leading-4">{description}</span>
        ) : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={fieldId} type="checkbox" className="peer sr-only" {...props} />
        <span
          className={cn(
            "h-6 w-11 rounded-full transition-colors duration-200",
            "surface-sunken shadow-[var(--inset-well)]",
            "peer-checked:bg-[var(--accent)] peer-checked:shadow-none",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-ring)]",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white",
            "shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200",
            "peer-checked:translate-x-5",
          )}
        />
      </span>
    </label>
  );
}
