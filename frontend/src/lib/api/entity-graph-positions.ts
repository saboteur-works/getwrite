/**
 * @module api/entity-graph-positions
 *
 * Client transport for the entity-graph node position persistence (Feature
 * 68, Task 12: `meta/entity-graph-positions.json`, FR-9/FR-10), mirroring
 * `entity-graph-settings.ts`'s GET-list/PUT-upsert pattern.
 *
 * Failure contract: every method REJECTS on a network error, non-2xx status,
 * or malformed body (the malformed body is also reported through
 * `reportTransportValidationFailure`). A failed read must never silently
 * surface as "no positions saved yet," so `getEntityGraphPositions` never
 * degrades to `[]`; `saveEntityGraphPosition` rejects on a malformed body
 * too, even though the save has by then succeeded server-side, so the
 * caller re-reads rather than trusting a fabricated value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-entity-graph-positions-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { EntityGraphPositionRecord } from "../models/entity-graph-positions";
import {
  EntityGraphPositionRecordResponseSchema,
  EntityGraphPositionsListResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { EntityGraphPositionRecord };

/** The entity-graph-positions operations both platforms implement. */
export interface EntityGraphPositionsTransport {
  /** Every persisted position record for the project. */
  getEntityGraphPositions(
    projectId: string,
  ): Promise<EntityGraphPositionRecord[]>;
  /** Upserts a single entity's drag-authored position. */
  saveEntityGraphPosition(
    projectId: string,
    entityId: string,
    x: number,
    y: number,
    connectionTypesSnapshot: string[],
  ): Promise<EntityGraphPositionRecord>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/entity-graph-positions";

/** HTTP transport — the hosted/desktop path. */
export const httpEntityGraphPositionsTransport: EntityGraphPositionsTransport =
  {
    async getEntityGraphPositions(projectId) {
      const query = new URLSearchParams({ projectId });
      const response = await fetch(`${ENDPOINT}?${query.toString()}`);
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to load the entity-graph positions (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = EntityGraphPositionsListResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(
          "entity-graph-positions.getEntityGraphPositions",
          parsed.error.issues,
        );
        throw new Error("The entity-graph positions response was malformed.");
      }
      return parsed.data;
    },

    async saveEntityGraphPosition(
      projectId,
      entityId,
      x,
      y,
      connectionTypesSnapshot,
    ) {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          entityId,
          x,
          y,
          connectionTypesSnapshot,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to save the entity-graph position (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = EntityGraphPositionRecordResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(
          "entity-graph-positions.saveEntityGraphPosition",
          parsed.error.issues,
        );
        throw new Error("The entity-graph position response was malformed.");
      }
      return parsed.data;
    },
  };

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-entity-graph-positions-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveEntityGraphPositionsTransport: () => Promise<EntityGraphPositionsTransport> =
  createTransport(httpEntityGraphPositionsTransport, () =>
    import("../../store/transport/native-entity-graph-positions-backend").then(
      ({ createNativeEntityGraphPositionsTransport }) =>
        createNativeEntityGraphPositionsTransport(),
    ),
  );

/**
 * Every persisted entity-graph node position for the project. Rejects on any
 * failure; never resolves to `[]` on a failed read.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function getEntityGraphPositions(
  projectId: string,
): Promise<EntityGraphPositionRecord[]> {
  const transport = await resolveEntityGraphPositionsTransport();
  return transport.getEntityGraphPositions(projectId);
}

/**
 * Upserts a single entity's drag-authored position. Rejects on any failure.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param entityId - The entity whose position is being saved.
 * @param x - The node's x-coordinate.
 * @param y - The node's y-coordinate.
 * @param connectionTypesSnapshot - The project's active connection-type list
 *   at the moment this position was saved (FR-11 invalidation comparison).
 */
export async function saveEntityGraphPosition(
  projectId: string,
  entityId: string,
  x: number,
  y: number,
  connectionTypesSnapshot: string[],
): Promise<EntityGraphPositionRecord> {
  const transport = await resolveEntityGraphPositionsTransport();
  return transport.saveEntityGraphPosition(
    projectId,
    entityId,
    x,
    y,
    connectionTypesSnapshot,
  );
}
