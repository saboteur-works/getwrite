/**
 * @module api/saved-defaults-http
 *
 * Shared HTTP implementation for the two saved-defaults clients
 * (`compile-defaults.ts`, `export-defaults.ts`; Feature 101, FR-3).
 *
 * Failure contract: rejects on a network error, a non-2xx status (the
 * server's refusal message is the error message) or a malformed body (reported
 * through `reportTransportValidationFailure`, which never receives the body).
 * It never returns a fabricated value.
 */
import { z } from "zod";
import { reportTransportValidationFailure } from "./transport-validation";

/** The saved-defaults operation both platforms implement. */
export interface SavedDefaultsTransport {
  /** Sets (a list of ids) or clears (`null`) the saved exclusions. */
  setDefaults(
    projectId: string,
    excludedResourceIds: string[] | null,
  ): Promise<{ excludedResourceIds: string[] | undefined }>;
}

/**
 * Matches `saved-defaults-core.ts`'s result. The key is optional because
 * `JSON.stringify` drops an `undefined` value (a clear).
 */
const SetSavedDefaultsResponseSchema = z.object({
  excludedResourceIds: z.array(z.string()).optional(),
});

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/**
 * Builds the HTTP transport for one endpoint.
 *
 * @param endpoint - The PUT route.
 * @param callSite - Label passed to the validation reporter.
 * @param noun - Used in the status fallback message.
 */
export function createHttpSavedDefaultsTransport(
  endpoint: string,
  callSite: string,
  noun: string,
): SavedDefaultsTransport {
  return {
    async setDefaults(projectId, excludedResourceIds) {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, excludedResourceIds }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to save the ${noun} (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = SetSavedDefaultsResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(callSite, parsed.error.issues);
        throw new Error(`The ${noun} response was malformed.`);
      }
      return { excludedResourceIds: parsed.data.excludedResourceIds };
    },
  };
}
