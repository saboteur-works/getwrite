/**
 * @module api/entity-graph-settings
 *
 * Client transport for a project's entity-graph settings (Feature 68, Task 6:
 * `entityGraphConnectionTypes` and `entityGraphFocalHopRadius`, FR-7/FR-8/
 * FR-21), mirroring `writing-log.ts`'s GET-aggregate/PUT-setter pattern
 * exactly.
 *
 * Failure contract: every method REJECTS on a network error, non-2xx status,
 * or malformed body (the malformed body is also reported through
 * `reportTransportValidationFailure`). A failed read must never silently
 * surface as the default settings, so `getEntityGraphSettings` never
 * degrades; `setEntityGraphSettings` rejects on a malformed body too, even
 * though the save has by then succeeded server-side, so the caller re-reads
 * rather than trusting a fabricated value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-entity-graph-settings-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { EntityGraphSettings } from "../models/entity-graph-settings-core";
import { EntityGraphSettingsResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { EntityGraphSettings };

/** The entity-graph-settings operations both platforms implement. */
export interface EntityGraphSettingsTransport {
  /** The project's effective entity-graph settings, defaults filled in. */
  getEntityGraphSettings(projectId: string): Promise<EntityGraphSettings>;
  /**
   * Sets the project's connection-type list and focal hop radius.
   * `connectionTypes` is filtered to known keys server-side (FR-2) — an
   * unrecognized key is silently dropped, never rejected.
   */
  setEntityGraphSettings(
    projectId: string,
    connectionTypes: string[],
    hopRadius: number,
  ): Promise<EntityGraphSettings>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/entity-graph-settings";

/** HTTP transport — the hosted/desktop path. */
export const httpEntityGraphSettingsTransport: EntityGraphSettingsTransport = {
  async getEntityGraphSettings(projectId) {
    const query = new URLSearchParams({ projectId });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to load the entity-graph settings (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = EntityGraphSettingsResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "entity-graph-settings.getEntityGraphSettings",
        parsed.error.issues,
      );
      throw new Error("The entity-graph settings response was malformed.");
    }
    return parsed.data;
  },

  async setEntityGraphSettings(projectId, connectionTypes, hopRadius) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        entityGraphConnectionTypes: connectionTypes,
        entityGraphFocalHopRadius: hopRadius,
      }),
    });
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to save the entity-graph settings (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = EntityGraphSettingsResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "entity-graph-settings.setEntityGraphSettings",
        parsed.error.issues,
      );
      throw new Error("The entity-graph settings response was malformed.");
    }
    return parsed.data;
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-entity-graph-settings-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveEntityGraphSettingsTransport: () => Promise<EntityGraphSettingsTransport> =
  createTransport(httpEntityGraphSettingsTransport, () =>
    import("../../store/transport/native-entity-graph-settings-backend").then(
      ({ createNativeEntityGraphSettingsTransport }) =>
        createNativeEntityGraphSettingsTransport(),
    ),
  );

/**
 * The project's effective entity-graph settings, defaults filled in. Rejects
 * on any failure; never resolves to a fabricated default on a failed read.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function getEntityGraphSettings(
  projectId: string,
): Promise<EntityGraphSettings> {
  const transport = await resolveEntityGraphSettingsTransport();
  return transport.getEntityGraphSettings(projectId);
}

/**
 * Sets the project's connection-type list and focal hop radius. Rejects on
 * any failure.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param connectionTypes - Requested connection-type keys; unrecognized keys
 *   are filtered out server-side (FR-2), never rejected.
 * @param hopRadius - Must be a non-negative integer.
 */
export async function setEntityGraphSettings(
  projectId: string,
  connectionTypes: string[],
  hopRadius: number,
): Promise<EntityGraphSettings> {
  const transport = await resolveEntityGraphSettingsTransport();
  return transport.setEntityGraphSettings(
    projectId,
    connectionTypes,
    hopRadius,
  );
}
