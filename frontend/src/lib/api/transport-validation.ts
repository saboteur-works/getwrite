/**
 * @module api/transport-validation
 *
 * Shared helper for reporting a transport-boundary response validation
 * failure (see `specs/product/getwrite.features.md` Feature 48 and
 * `docs/standards/security.md`'s unconditional prohibition on logging
 * decrypted content).
 *
 * Every `lib/api/*.ts` module that validates a server response against a
 * Zod schema calls this on a validation failure instead of logging the raw
 * response body itself. On an encrypted project, a response body can carry
 * server-decrypted, user-authored prose (e.g. `plainText`, `tiptap`, `notes`
 * fields) — logging it would violate that prohibition. This helper's
 * signature only accepts a call-site identifier and the Zod issue list, so
 * it is structurally incapable of being handed a raw body.
 *
 * Synchronous and side-effect-free beyond the console call itself: no
 * `Promise`, no `await`, no network or filesystem I/O. Deliberately has no
 * import from `frontend/src/store/` or any React/UI module, so it can be
 * imported by every `lib/api/*.ts` module without pulling those in.
 */

import type { z } from "zod";

/**
 * Reports a transport response validation failure. Logs only the call-site
 * identifier and each issue's own `path`/`message`/`code` — never a raw or
 * unvalidated response body, which must not be passed to this function.
 */
export function reportTransportValidationFailure(
  callSite: string,
  issues: z.ZodIssue[],
): void {
  console.warn(
    `[transport-validation] ${callSite}: response validation failed`,
    issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    })),
  );
}
