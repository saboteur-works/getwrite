/**
 * @module api/modules
 *
 * Client transport for the per-project module switch (Feature 103, FR-5,
 * FR-7, FR-30), mirroring `goal-filter.ts`.
 *
 * Failure contract: `setModuleEnabled` rejects on a network error, a non-2xx
 * status (the server's refusal message is the error message), or a malformed
 * body (reported through `reportTransportValidationFailure`, which never
 * receives the body). A locked project (HTTP 401 or 409) is turned back into
 * the locked-access error the native backend throws, through
 * `locked-response.ts`. It never returns a fabricated value; the caller keeps
 * the writer's choice and shows the failure.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-modules-backend`) on native.
 */
import { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

/** What a module-switch write sends. */
export interface ModuleSwitchRequest {
  projectId: string;
  moduleId: string;
  enabled: boolean;
}

/** The project's stored module flags after a write. */
export interface ModuleSwitchResult {
  modules: Record<string, boolean>;
}

/** The module-switch operations both platforms implement. */
export interface ModulesTransport {
  /** Sets `config.modules[moduleId]`, keeping every other entry. */
  setModuleEnabled(request: ModuleSwitchRequest): Promise<ModuleSwitchResult>;
}

const SetModuleEnabledResponseSchema = z.object({
  modules: z.record(z.string(), z.boolean()),
});

const ENDPOINT = "/api/project/modules";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/** HTTP transport: the hosted/desktop path. */
export const httpModulesTransport: ModulesTransport = {
  async setModuleEnabled(request) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const locked = lockedAccessErrorFromResponse(response, request.projectId);
      if (locked) throw locked;
      throw new Error(
        await errorMessage(
          response,
          `Failed to save the module setting (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = SetModuleEnabledResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "modules.setModuleEnabled",
        parsed.error.issues,
      );
      throw new Error("The module setting response was malformed.");
    }
    return { modules: parsed.data.modules };
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-modules-backend")` specifier
 * so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveModulesTransport: () => Promise<ModulesTransport> =
  createTransport(httpModulesTransport, () =>
    import("../../store/transport/native-modules-backend").then(
      ({ createNativeModulesTransport }) => createNativeModulesTransport(),
    ),
  );

/**
 * Switches a module on or off for one project. Rejects on any failure,
 * including a locked project.
 */
export async function setModuleEnabled(
  request: ModuleSwitchRequest,
): Promise<ModuleSwitchResult> {
  const transport = await resolveModulesTransport();
  return transport.setModuleEnabled(request);
}
