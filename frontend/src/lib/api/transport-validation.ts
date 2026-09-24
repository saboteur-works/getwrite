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
 * Synchronous and side-effect-free beyond the console call and raising a
 * generic toast: no `Promise`, no `await`, no network or filesystem I/O.
 * Deliberately has no import from `frontend/src/store/` or any React module
 * (`toastService` is a plain `lib/` module, not React/store), so it can be
 * imported by every `lib/api/*.ts` module without pulling those in.
 *
 * The toast raised here is intentionally generic — it never names the call
 * site or repeats an issue's `path`/`message`/`code`, since those are for
 * the console only. It uses a fixed, stable id so many simultaneous
 * validation failures collapse into a single visible toast instead of
 * stacking.
 */

import type { z } from "zod";
import { toastService } from "../toast-service";

/**
 * Why a read failed, in a shape that structurally CANNOT carry a response
 * body. Same discipline as {@link reportTransportValidationFailure}'s
 * signature: a status code or the fact of a network failure is all a report
 * needs, and anything richer risks logging server-decrypted user prose on an
 * encrypted project (`docs/standards/security.md`).
 */
export type TransportReadFailure =
  | { kind: "http"; status: number }
  | { kind: "network" };

const TRANSPORT_VALIDATION_TOAST_ID = "transport-validation-error";
const TRANSPORT_VALIDATION_TOAST_MESSAGE =
  "Some data couldn't be loaded correctly.";

/**
 * Reports a transport response validation failure. Logs only the call-site
 * identifier and each issue's own `path`/`message`/`code` — never a raw or
 * unvalidated response body, which must not be passed to this function.
 * Also raises a generic, user-visible toast (deduped by a fixed id) that
 * carries none of that detail.
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
  toastService.error(TRANSPORT_VALIDATION_TOAST_MESSAGE, undefined, {
    id: TRANSPORT_VALIDATION_TOAST_ID,
  });
}

/**
 * Reports a transport read that failed WITHOUT reaching schema validation — a
 * non-2xx response, or a thrown request (offline, DNS, aborted).
 *
 * These call sites degrade to an empty value by design (Features 48/50), and
 * that contract is unchanged. What changes is that the failure is no longer
 * silent: until this existed, `reportTransportValidationFailure` covered only
 * a malformed body, so a 500 and a dropped connection — the other two ways a
 * read fails — produced an empty roster, graph, or mention list with nothing
 * logged and nothing shown. A writer read that as "there is nothing here"
 * (`docs/standards/failure-visibility.md`).
 *
 * Shares the validation toast's id so a burst of failures across several
 * transports collapses into one visible message rather than stacking.
 */
export function reportTransportReadFailure(
  callSite: string,
  failure: TransportReadFailure,
): void {
  console.warn(
    `[transport-read] ${callSite}: read failed`,
    failure.kind === "http" ? { status: failure.status } : { kind: "network" },
  );
  toastService.error(TRANSPORT_VALIDATION_TOAST_MESSAGE, undefined, {
    id: TRANSPORT_VALIDATION_TOAST_ID,
  });
}
