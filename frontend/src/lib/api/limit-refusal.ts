/**
 * @module lib/api/limit-refusal
 *
 * Feature 77 (paired-device limits): the server refuses a limited action from
 * a paired device with 403 `{ error, limit }` (`limits-copy.ts` holds the
 * messages). The four transports that can hit such a route (encryption, Trash
 * purge, project delete, revision delete) use this module to turn that body
 * into one shared error type, so the caller sees the server's message and the
 * `limit` key instead of a generic failure. Any other status or body shape is
 * left to the transport's own handling.
 *
 * Imports only types and a constant record from `lib/sharing/`, so it is safe
 * in the browser bundle.
 */
import { z } from "zod";

import { LIMIT_REFUSAL_MESSAGES } from "../sharing/limits-copy";
import type { LimitKey } from "../sharing/limits-store";

/** A 403 refusal from a limited route; `message` is the server's own text. */
export class LimitRefusalError extends Error {
  readonly limit: LimitKey;

  constructor(message: string, limit: LimitKey) {
    super(message);
    this.name = "LimitRefusalError";
    this.limit = limit;
  }
}

/** Type guard for {@link LimitRefusalError}. */
export function isLimitRefusalError(
  error: unknown,
): error is LimitRefusalError {
  return error instanceof LimitRefusalError;
}

const LimitRefusalBodySchema = z.object({
  error: z.string(),
  limit: z
    .string()
    .refine((value): value is LimitKey =>
      Object.prototype.hasOwnProperty.call(LIMIT_REFUSAL_MESSAGES, value),
    ),
});

/**
 * Recognises a limit refusal.
 *
 * @param status - The HTTP status of the failed response.
 * @param body - The already-parsed JSON body (or whatever could be read).
 * @returns A {@link LimitRefusalError} for a 403 whose body is `{ error, limit }`
 *   with a known limit key; `null` for anything else.
 */
export function limitRefusalFromResponse(
  status: number,
  body: unknown,
): LimitRefusalError | null {
  if (status !== 403) return null;
  const parsed = LimitRefusalBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return new LimitRefusalError(
    parsed.data.error,
    parsed.data.limit as LimitKey,
  );
}
