/**
 * @module api/claims
 *
 * Client transport for the claim ledger (Feature 108, FR-21): the
 * project-wide claim list, creating a claim and updating one. HTTP on
 * web/desktop, an in-process backend (`native-claims-backend`) on native,
 * resolved through `createTransport` (which uses the raw
 * `NEXT_PUBLIC_GETWRITE_RUNTIME` comparison).
 *
 * Requests carry `projectId` and, for writes, `resourceId`; never a path.
 * Responses are parsed with `AnnotationResponseSchema`, which keeps `claim`.
 *
 * Failure contract: every method rejects on a network error, a non-2xx status
 * (the server's refusal message is the error message), a locked project
 * (HTTP 401 or 409, turned into the locked-access error through
 * `locked-response.ts`) or a malformed body (reported through
 * `reportTransportValidationFailure`, which never receives the body).
 * `listClaims` never resolves an empty list for a failed read: an empty
 * `claims` array means there are none, and a resource whose annotations could
 * not be read is returned in `failures`, not dropped.
 */
import { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
import type {
  ClaimListResult,
  ClaimRecord,
  NewClaimInput,
  UpdateClaimInput,
} from "../models/claim-types";
import type { Annotation } from "../models/types";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { AnnotationResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { ClaimListResult, ClaimRecord, NewClaimInput, UpdateClaimInput };

/** The claim operations both platforms implement. */
export interface ClaimsTransport {
  /** Every claim in the project, plus the resources that could not be read. */
  list(projectId: string): Promise<ClaimListResult>;
  /** Stores a new claim (status `unverified`); resolves the stored annotation. */
  add(
    projectId: string,
    resourceId: string,
    claim: NewClaimInput,
  ): Promise<ClaimRecord>;
  /** Changes status, statement or Source link; resolves the stored annotation. */
  update(
    projectId: string,
    resourceId: string,
    annotationId: string,
    update: UpdateClaimInput,
  ): Promise<ClaimRecord>;
}

const ListResponseSchema = z.object({
  claims: z.array(
    z.object({
      resourceId: z.string(),
      resourceName: z.string(),
      annotation: AnnotationResponseSchema,
    }),
  ),
  failures: z.array(
    z.object({
      resourceId: z.string(),
      resourceName: z.string(),
      message: z.string(),
    }),
  ),
});
const OneResponseSchema = z.object({ annotation: AnnotationResponseSchema });

const ENDPOINT = "/api/claims";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/** Throws the locked-access error or the server's message for a failed response. */
async function rejectFailed(
  response: Response,
  projectId: string,
  fallback: string,
): Promise<never> {
  const locked = lockedAccessErrorFromResponse(response, projectId);
  if (locked) throw locked;
  throw new Error(
    await errorMessage(response, `${fallback} (HTTP ${response.status}).`),
  );
}

async function write(
  method: "POST" | "PUT",
  projectId: string,
  payload: Record<string, unknown>,
  fallback: string,
  callSite: string,
): Promise<Annotation> {
  const response = await fetch(ENDPOINT, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return rejectFailed(response, projectId, fallback);
  const parsed = OneResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The claim response was malformed.");
  }
  return parsed.data.annotation as Annotation;
}

/** HTTP transport: the hosted/desktop path. */
export const httpClaimsTransport: ClaimsTransport = {
  async list(projectId) {
    const response = await fetch(
      `${ENDPOINT}?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!response.ok) {
      return rejectFailed(response, projectId, "Failed to read the claims");
    }
    const parsed = ListResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportTransportValidationFailure(
        "claims.listClaims",
        parsed.error.issues,
      );
      throw new Error("The claims response was malformed.");
    }
    return {
      claims: parsed.data.claims.map((entry) => ({
        ...entry,
        annotation: entry.annotation as Annotation,
      })),
      failures: parsed.data.failures,
    };
  },
  add(projectId, resourceId, claim) {
    return write(
      "POST",
      projectId,
      { projectId, resourceId, claim },
      "Failed to add the claim",
      "claims.addClaim",
    );
  },
  update(projectId, resourceId, annotationId, update) {
    return write(
      "PUT",
      projectId,
      { projectId, resourceId, annotationId, update },
      "Failed to update the claim",
      "claims.updateClaim",
    );
  },
};

/**
 * The thunk carries the literal `import(...)` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveClaimsTransport: () => Promise<ClaimsTransport> = createTransport(
  httpClaimsTransport,
  () =>
    import("../../store/transport/native-claims-backend").then(
      ({ createNativeClaimsTransport }) => createNativeClaimsTransport(),
    ),
);

/** Lists the project's claims; rejects on any failure. */
export async function listClaims(projectId: string): Promise<ClaimListResult> {
  return (await resolveClaimsTransport()).list(projectId);
}

/** Adds a claim; resolves the stored annotation. */
export async function addClaim(
  projectId: string,
  resourceId: string,
  claim: NewClaimInput,
): Promise<ClaimRecord> {
  return (await resolveClaimsTransport()).add(projectId, resourceId, claim);
}

/** Updates a claim's status, statement or Source link; resolves the stored annotation. */
export async function updateClaim(
  projectId: string,
  resourceId: string,
  annotationId: string,
  update: UpdateClaimInput,
): Promise<ClaimRecord> {
  return (await resolveClaimsTransport()).update(
    projectId,
    resourceId,
    annotationId,
    update,
  );
}
