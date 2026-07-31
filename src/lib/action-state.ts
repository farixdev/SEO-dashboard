/**
 * Shared shape for every server action's return value.
 *
 * Deliberately free of `server-only` and of any server imports: client
 * components need `ActionState` and `idle` to seed `useActionState`.
 */
export type ActionState<T = unknown> = {
  ok: boolean;
  message?: string;
  /** field name → first error message */
  errors?: Record<string, string>;
  data?: T;
};

/** Initial value for `useActionState` — nothing submitted yet. */
export const idle: ActionState = { ok: false };

export function ok<T = unknown>(message?: string, data?: T): ActionState<T> {
  return { ok: true, message, data };
}

/** Generic so a failure can satisfy an action typed `ActionState<Payload>`. */
export function fail<T = unknown>(
  message: string,
  errors?: Record<string, string>,
): ActionState<T> {
  return { ok: false, message, errors };
}
