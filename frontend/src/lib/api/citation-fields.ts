/**
 * @module api/citation-fields
 *
 * Client for a Source's citation fields (Feature 116, FR-6, FR-21):
 * `GET /api/citations/fields?projectId=&resourceId=` and
 * `PUT /api/citations/fields` with `projectId`, `resourceId` and the
 * validated fields; never a path. HTTP only: there is no native backend
 * (Android is not claimed).
 *
 * Failure contract: both functions resolve a result that tells the outcomes
 * apart by `kind`. A read resolves `{ kind: "fields", fields: null }` only
 * when the server says no fields are stored; a thrown fetch, a non-2xx
 * status, a server-reported failure or a malformed body resolves
 * `{ kind: "failed" }` with a fixed message, never "no fields". A locked
 * project (HTTP 401 or 409, through `locked-response.ts`) is rethrown as the
 * locked-access error. A malformed body is reported through
 * `reportTransportValidationFailure`, which never receives the body. The
 * server's error text is not shown, so no client input is echoed.
 */
import { z } from "zod";
import {
  validateCitationFields,
  type CitationFields,
} from "../models/citations-fields-validation";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

const ENDPOINT = "/api/citations/fields";

/** Fixed text for a failed read. */
export const CITATION_FIELDS_LOAD_FAILED_MESSAGE =
  "The citation fields could not be loaded.";
/** Fixed text for a failed save. */
export const CITATION_FIELDS_SAVE_FAILED_MESSAGE =
  "The citation fields could not be saved.";

/** Outcome of reading a Source's citation fields. */
export type CitationFieldsLoadResult =
  | { kind: "fields"; fields: CitationFields | null }
  | { kind: "failed"; message: string };

/** Outcome of saving a Source's citation fields. */
export type CitationFieldsSaveResult =
  | { kind: "saved"; fields: CitationFields }
  | { kind: "failed"; message: string };

/** Accepts exactly what the write-boundary validator accepts. */
const FieldsSchema = z.custom<CitationFields>(
  (value) => validateCitationFields(value).ok,
);

const LoadResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fields"), fields: FieldsSchema.nullable() }),
  z.object({ kind: z.literal("failed"), message: z.string() }),
]);

const SaveResponseSchema = z.object({ fields: FieldsSchema });

function loadFailed(): CitationFieldsLoadResult {
  return { kind: "failed", message: CITATION_FIELDS_LOAD_FAILED_MESSAGE };
}

function saveFailed(): CitationFieldsSaveResult {
  return { kind: "failed", message: CITATION_FIELDS_SAVE_FAILED_MESSAGE };
}

/** Reads a response body as JSON; `undefined` when it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Reads the stored citation fields of a Source.
 *
 * @returns The fields (or null when none are stored), or `failed`.
 * @throws The locked-access error when the project is locked.
 */
export async function readCitationFields(
  projectId: string,
  resourceId: string,
): Promise<CitationFieldsLoadResult> {
  const query = new URLSearchParams({ projectId, resourceId });
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${query.toString()}`);
  } catch {
    return loadFailed();
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return loadFailed();
  }
  const parsed = LoadResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    reportTransportValidationFailure(
      "citation-fields.readCitationFields",
      parsed.error.issues,
    );
    return loadFailed();
  }
  if (parsed.data.kind === "failed") return loadFailed();
  return parsed.data;
}

/**
 * Saves the citation fields of a Source. Fields that fail the write-boundary
 * validation are not sent.
 *
 * @returns The stored fields, or `failed`.
 * @throws The locked-access error when the project is locked.
 */
export async function writeCitationFields(
  projectId: string,
  resourceId: string,
  fields: unknown,
): Promise<CitationFieldsSaveResult> {
  const checked = validateCitationFields(fields);
  if (!checked.ok) return saveFailed();
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceId, fields: checked.value }),
    });
  } catch {
    return saveFailed();
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return saveFailed();
  }
  const parsed = SaveResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    reportTransportValidationFailure(
      "citation-fields.writeCitationFields",
      parsed.error.issues,
    );
    return saveFailed();
  }
  return { kind: "saved", fields: parsed.data.fields };
}
