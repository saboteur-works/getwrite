/**
 * @module api/organizer-arrangements
 *
 * Client transport for the Organizer's saved-arrangement operations (Feature
 * 109, Task 27, FR-14): add, rename and delete through one route, resolved
 * through `createTransport` (HTTP on web/desktop, an in-process backend on
 * native).
 *
 * Wire contract: `POST /api/project/organizer-arrangements`, JSON body
 * `{ projectId, ...operation }` where `operation` is the flat
 * `OrganizerArrangementOperation` (`{ op: "add", name, source, rows,
 * columns }`, `{ op: "rename", id, name }` or `{ op: "delete", id }`). The
 * response body is the `OrganizerArrangementResult` JSON
 * (`{ ok: true, id }` or `{ ok: false, reason, message }`); it is parsed the
 * same at any status, so a refusal is returned with its message text.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): a network error,
 * a non-2xx response without a refusal body or a malformed body returns
 * `{ ok: false, reason: "request-failed", message }`, never an ok result. A
 * locked project REJECTS with the locked-access error, as the native backend
 * does, so one `isLockedAccessError` check covers both transports.
 */
import { z } from "zod";

import { createTransport } from "../../store/transport/create-transport";
import type {
  OrganizerArrangementAddInput,
  OrganizerArrangementAddResult,
  OrganizerArrangementDeleteInput,
  OrganizerArrangementDeleteResult,
  OrganizerArrangementOperation,
  OrganizerArrangementRenameInput,
  OrganizerArrangementRenameResult,
} from "../models/organizer-grid-types";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

const ENDPOINT = "/api/project/organizer-arrangements";

/** A request that failed before or instead of the core answering. */
export interface OrganizerArrangementRequestFailure {
  ok: false;
  reason: "request-failed";
  message: string;
}

export type OrganizerArrangementTransportResult<R> =
  | R
  | OrganizerArrangementRequestFailure;

/** The operations both platforms implement. */
export interface OrganizerArrangementsTransport {
  add(
    projectId: string,
    input: OrganizerArrangementAddInput,
  ): Promise<
    OrganizerArrangementTransportResult<OrganizerArrangementAddResult>
  >;
  rename(
    projectId: string,
    input: OrganizerArrangementRenameInput,
  ): Promise<
    OrganizerArrangementTransportResult<OrganizerArrangementRenameResult>
  >;
  delete(
    projectId: string,
    input: OrganizerArrangementDeleteInput,
  ): Promise<
    OrganizerArrangementTransportResult<OrganizerArrangementDeleteResult>
  >;
}

const ResultSchema = z.union([
  z.object({ ok: z.literal(true), id: z.string().min(1) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      "name-blank",
      "name-too-long",
      "name-duplicate",
      "limit-reached",
      "invalid-source",
      "invalid-axis",
      "invalid-id",
      "not-found",
      "invalid-input",
    ]),
    message: z.string(),
  }),
]);

function failure(message: string): OrganizerArrangementRequestFailure {
  return { ok: false, reason: "request-failed", message };
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function post(
  projectId: string,
  operation: OrganizerArrangementOperation,
  callSite: string,
  verb: string,
): Promise<OrganizerArrangementTransportResult<OrganizerArrangementAddResult>> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...operation }),
    });
  } catch {
    return failure(`Could not ${verb} the arrangement: the request failed.`);
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
  }
  const body = await readBody(response);
  const parsed = ResultSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    return failure(
      typeof error === "string"
        ? error
        : `Could not ${verb} the arrangement (HTTP ${response.status}).`,
    );
  }
  reportTransportValidationFailure(callSite, parsed.error.issues);
  return failure(`The ${verb} arrangement response was malformed.`);
}

const httpTransport: OrganizerArrangementsTransport = {
  add: (projectId, input) =>
    post(
      projectId,
      { op: "add", ...input },
      "organizer-arrangements.add",
      "save",
    ),
  rename: (projectId, input) =>
    post(
      projectId,
      { op: "rename", ...input },
      "organizer-arrangements.rename",
      "rename",
    ),
  delete: (projectId, input) =>
    post(
      projectId,
      { op: "delete", ...input },
      "organizer-arrangements.delete",
      "delete",
    ),
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-organizer-arrangements-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute the
 * web stub (Task 28).
 */
const resolveTransport: () => Promise<OrganizerArrangementsTransport> =
  createTransport(httpTransport, () =>
    import("../../store/transport/native-organizer-arrangements-backend").then(
      ({ createNativeOrganizerArrangementsTransport }) =>
        createNativeOrganizerArrangementsTransport(),
    ),
  );

/** Saves a new arrangement. A refusal or failure is a result with text. */
export async function addOrganizerArrangement(
  projectId: string,
  input: OrganizerArrangementAddInput,
): Promise<OrganizerArrangementTransportResult<OrganizerArrangementAddResult>> {
  return (await resolveTransport()).add(projectId, input);
}

/** Renames an arrangement. */
export async function renameOrganizerArrangement(
  projectId: string,
  input: OrganizerArrangementRenameInput,
): Promise<
  OrganizerArrangementTransportResult<OrganizerArrangementRenameResult>
> {
  return (await resolveTransport()).rename(projectId, input);
}

/** Deletes an arrangement. */
export async function deleteOrganizerArrangement(
  projectId: string,
  input: OrganizerArrangementDeleteInput,
): Promise<
  OrganizerArrangementTransportResult<OrganizerArrangementDeleteResult>
> {
  return (await resolveTransport()).delete(projectId, input);
}
