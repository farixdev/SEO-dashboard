import "server-only";

import type { z } from "zod";

export {
  type ActionState,
  fail,
  idle,
  ok,
} from "./action-state";

/**
 * Zod-validates a FormData payload. Multi-value fields are collected as arrays
 * so `getAll` values survive, and empty strings stay empty for the schema's own
 * preprocessors to normalise.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { success: true; data: z.infer<S> } | { success: false; errors: Record<string, string> } {
  const raw: Record<string, unknown> = {};

  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }

  const parsed = schema.safeParse(raw);
  if (parsed.success) return { success: true, data: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_form";
    if (!errors[path]) errors[path] = issue.message;
  }
  return { success: false, errors };
}

/** Turns a thrown error into a user-safe message. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Surface Postgres constraint violations in plain language.
    if (/duplicate key|unique constraint/i.test(msg)) {
      if (/users_email/i.test(msg)) return "That email address is already in use.";
      if (/projects_slug/i.test(msg)) return "A project with that name already exists.";
      if (/pages_project_title/i.test(msg))
        return "A page with that title already exists in this project.";
      if (/keywords_project_keyword/i.test(msg))
        return "That keyword is already tracked in this project.";
      if (/rankings_keyword_month/i.test(msg))
        return "A ranking for that keyword and month already exists.";
      if (/analytics_project_month/i.test(msg))
        return "That month is already recorded for this country.";
      return "That record already exists.";
    }
    if (/violates foreign key/i.test(msg)) {
      return "A linked record is missing or was deleted.";
    }
    if (/DATABASE_URL/i.test(msg)) {
      return "The database is not configured yet. Add DATABASE_URL to .env.local.";
    }
    return msg;
  }
  return "Something went wrong. Please try again.";
}

/** Normalises `undefined` to `null` for nullable DB columns. */
export function nullify<T>(value: T | undefined | ""): T | null {
  return value === undefined || value === "" ? null : value;
}
