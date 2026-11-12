/**
 * @module api/organizer-field-write
 *
 * Client transport for the Organizer grid's field write (Feature 109, Task 13,
 * FR-7, FR-13): one write per drop, for one resource, carrying every changed
 * field.
 *
 * Result contract (`docs/standards/failure-visibility.md`): the call resolves
 * to one of four results that a caller must tell apart, and a failure is never
 * an empty or done result.
 *  - `done`: the write succeeded.
 *  - `refused`: the core refused the value (reason and text from the core).
 *  - `gone`: the resource no longer exists. An HTTP 404 carrying the sidecar
 *    route's `resource-gone` code and the native `ResourceGoneError` map here
 *    identically.
 *  - `failed`: a network failure, another non-2xx status, a malformed body or
 *    any other native error.
 * A locked or encrypted-without-key project is REJECTED with the locked-access
 * error (HTTP 401 or 409 mapped by `lockedAccessErrorFromResponse`; the native
 * backend throws the same classes), so one `isLockedAccessError` check covers
 * both transports.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-organizer-field-write-backend`) on native. The native
 * backend's shape is assumed to be
 * `createNativeOrganizerFieldWriteTransport()` returning
 * `{ setOrganizerFields(projectId, input) }`.
 */
import { z } from "zod";

import { isLockedAccessError } from "../models/locked-access";
import type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteRefusalReason,
  OrganizerFieldWriteResult,
} from "../models/organizer-grid-types";
import {
  RESOURCE_GONE_CODE,
  ResourceGoneError,
} from "../models/resource-gone-error";
import { createTransport } from "../../store/transport/create-transport";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

/** The field-write route (Task 12); the only path this module names. */
export const ORGANIZER_FIELD_WRITE_ENDPOINT = "/api/project/organizer-field";

const CALL_SITE = "organizer-field-write.setOrganizerFields";

/** What a caller of {@link setOrganizerFields} receives. */
export type OrganizerFieldWriteOutcome =
  | { status: "done"; resourceId: string }
  | {
      status: "refused";
      reason: OrganizerFieldWriteRefusalReason;
      message: string;
    }
  | { status: "gone" }
  | { status: "failed"; message: string };

/** The shape assumed for Task 14's native backend (the core's result). */
interface NativeOrganizerFieldWriteBackend {
  setOrganizerFields(
    projectId: string,
    input: OrganizerFieldWriteInput,
  ): Promise<OrganizerFieldWriteResult>;
}

/** The internal operation both platforms are adapted to. */
interface OrganizerFieldWriteTransport {
  setOrganizerFields(
    projectId: string,
    input: OrganizerFieldWriteInput,
  ): Promise<OrganizerFieldWriteOutcome>;
}

const REASONS = [
  "invalid-input",
  "unknown-field",
  "value-not-in-list",
  "subtype-not-in-list",
  "field-out-of-subtype-scope",
  "field-locked",
  "max-selections-exceeded",
] as const satisfies readonly OrganizerFieldWriteRefusalReason[];

const ResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), resourceId: z.string() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(REASONS),
    message: z.string(),
  }),
]);

function toOutcome(
  result: OrganizerFieldWriteResult,
): OrganizerFieldWriteOutcome {
  return result.ok
    ? { status: "done", resourceId: result.resourceId }
    : { status: "refused", reason: result.reason, message: result.message };
}

function parseResult(body: unknown): OrganizerFieldWriteOutcome {
  const parsed = ResultSchema.safeParse(body);
  if (!parsed.success) {
    reportTransportValidationFailure(CALL_SITE, parsed.error.issues);
    return {
      status: "failed",
      message: "The field write response was malformed.",
    };
  }
  return toOutcome(parsed.data);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorText(body: unknown, status: number): string {
  const error =
    typeof body === "object" && body !== null
      ? (body as { error?: unknown }).error
      : undefined;
  return typeof error === "string"
    ? error
    : `Failed to save the field (HTTP ${status}).`;
}

async function readHttpOutcome(
  response: Response,
  projectId: string,
): Promise<OrganizerFieldWriteOutcome> {
  const locked = lockedAccessErrorFromResponse(response, projectId);
  if (locked) throw locked;
  const body = await readJson(response);
  if (response.ok) return parseResult(body);
  const code =
    typeof body === "object" && body !== null
      ? (body as { code?: unknown }).code
      : undefined;
  if (response.status === 404 && code === RESOURCE_GONE_CODE) {
    return { status: "gone" };
  }
  const refusal = ResultSchema.safeParse(body);
  if (refusal.success && !refusal.data.ok) return toOutcome(refusal.data);
  return { status: "failed", message: errorText(body, response.status) };
}

/** HTTP transport: the hosted/desktop path. */
const httpTransport: OrganizerFieldWriteTransport = {
  async setOrganizerFields(projectId, input) {
    const response = await fetch(ORGANIZER_FIELD_WRITE_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, input }),
    });
    return readHttpOutcome(response, projectId);
  },
};

/**
 * Adapts the native backend (core result, or a thrown `ResourceGoneError`) to
 * the same outcomes the HTTP path produces.
 */
function nativeTransport(
  backend: NativeOrganizerFieldWriteBackend,
): OrganizerFieldWriteTransport {
  return {
    async setOrganizerFields(projectId, input) {
      try {
        return parseResult(await backend.setOrganizerFields(projectId, input));
      } catch (error) {
        if (error instanceof ResourceGoneError) return { status: "gone" };
        throw error;
      }
    },
  };
}

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-organizer-field-write-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time (Task 14).
 */
const resolveTransport: () => Promise<OrganizerFieldWriteTransport> =
  createTransport(httpTransport, () =>
    import("../../store/transport/native-organizer-field-write-backend").then(
      ({ createNativeOrganizerFieldWriteTransport }) =>
        nativeTransport(createNativeOrganizerFieldWriteTransport()),
    ),
  );

/**
 * Applies one field write to one resource.
 *
 * Never resolves to `done` unless the write succeeded. Rejects only with a
 * locked-access error; every other failure is a `failed` or `gone` result.
 */
export async function setOrganizerFields(
  projectId: string,
  input: OrganizerFieldWriteInput,
): Promise<OrganizerFieldWriteOutcome> {
  try {
    const transport = await resolveTransport();
    return await transport.setOrganizerFields(projectId, input);
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    if (error instanceof ResourceGoneError) return { status: "gone" };
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "The write failed.",
    };
  }
}
