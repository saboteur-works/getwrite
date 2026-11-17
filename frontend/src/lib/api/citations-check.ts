/**
 * @module api/citations-check
 *
 * Client for the pre-run citation check (Feature 116, FR-15, FR-21, FR-22):
 * `POST /api/citations/check` with `projectId` and `resourceIds`; never a
 * path. HTTP only: there is no native backend (Android is not claimed).
 *
 * Failure contract: `checkCitations` resolves a `CitationCheckResult`. A
 * thrown fetch, a non-2xx status or a malformed body resolves a `failed`
 * result with a fixed message, never an `ok` result with no gaps. A locked
 * project (HTTP 401 or 409, through `locked-response.ts`) is rethrown as the
 * locked-access error so the caller can open the unlock prompt. A malformed
 * body is reported through `reportTransportValidationFailure`, which never
 * receives the body.
 */
import { z } from "zod";
import type { CitationCheckResult } from "../models/citations-types";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

const ENDPOINT = "/api/citations/check";
const CHECK_FAILED_MESSAGE = "The citation check could not be run.";

const GapSchema = z.object({
  kind: z.enum(["source-removed", "missing-detail", "could-not-be-checked"]),
  resourceId: z.string(),
  sourceId: z.string(),
  sourceName: z.string().optional(),
  missingDetails: z.array(z.string()).optional(),
});

const ResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    gaps: z.array(GapSchema),
    citationCount: z.number().int().nonnegative(),
    incompleteSourceCount: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("failed"),
    failure: z.enum(["read-failed", "engine-failed", "style-load-failed"]),
    message: z.string(),
  }),
]);

function failed(): CitationCheckResult {
  return {
    status: "failed",
    failure: "read-failed",
    message: CHECK_FAILED_MESSAGE,
  };
}

/**
 * Runs the pre-run check over the resources about to be compiled.
 *
 * @returns The check result; `failed` for any transport or server failure.
 * @throws The locked-access error when the project is locked.
 */
export async function checkCitations(
  projectId: string,
  resourceIds: readonly string[],
): Promise<CitationCheckResult> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceIds }),
    });
  } catch {
    return failed();
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return failed();
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failed();
  }
  const parsed = ResultSchema.safeParse(body);
  if (!parsed.success) {
    reportTransportValidationFailure(
      "citations-check.checkCitations",
      parsed.error.issues,
    );
    return failed();
  }
  return parsed.data;
}
