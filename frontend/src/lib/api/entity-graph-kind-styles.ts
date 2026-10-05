/**
 * @module api/entity-graph-kind-styles
 *
 * Client transport for the entity-graph kind-style (color-slot/shape)
 * mapping (Feature 69, Task 4: `meta/entity-graph-kind-styles.json`),
 * mirroring `entity-graph-positions.ts`'s GET-list/PUT-upsert pattern
 * exactly.
 *
 * Failure contract: every method REJECTS on a network error, non-2xx
 * status, or malformed body (the malformed body is also reported through
 * `reportTransportValidationFailure`). A failed read must never silently
 * surface as "no styles configured yet," so `getEntityGraphKindStyles`
 * never degrades to `[]`; `saveEntityGraphKindStyle` rejects on a malformed
 * body too, even though the save has by then succeeded server-side, so the
 * caller re-reads rather than trusting a fabricated value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-entity-graph-kind-styles-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import type {
  EntityGraphKindColorSlot,
  EntityGraphKindStyleRecord,
} from "../models/entity-graph-kind-styles";
import {
  EntityGraphKindStyleRecordResponseSchema,
  EntityGraphKindStylesListResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { EntityGraphKindColorSlot, EntityGraphKindStyleRecord };

/** The entity-graph-kind-styles operations both platforms implement. */
export interface EntityGraphKindStylesTransport {
  /** Every persisted kind-style record for the project. */
  getEntityGraphKindStyles(
    projectId: string,
  ): Promise<EntityGraphKindStyleRecord[]>;
  /** Upserts a single kind's color-slot/shape style record. */
  saveEntityGraphKindStyle(
    projectId: string,
    entityKind: string,
    color: EntityGraphKindColorSlot,
    shape: EntityGraphKindStyleRecord["shape"],
  ): Promise<EntityGraphKindStyleRecord>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/entity-graph-kind-styles";

/** HTTP transport — the hosted/desktop path. */
export const httpEntityGraphKindStylesTransport: EntityGraphKindStylesTransport =
  {
    async getEntityGraphKindStyles(projectId) {
      const query = new URLSearchParams({ projectId });
      const response = await fetch(`${ENDPOINT}?${query.toString()}`);
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to load the entity-graph kind styles (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = EntityGraphKindStylesListResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(
          "entity-graph-kind-styles.getEntityGraphKindStyles",
          parsed.error.issues,
        );
        throw new Error("The entity-graph kind styles response was malformed.");
      }
      return parsed.data;
    },

    async saveEntityGraphKindStyle(projectId, entityKind, color, shape) {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, entityKind, color, shape }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            `Failed to save the entity-graph kind style (HTTP ${response.status}).`,
          ),
        );
      }
      const parsed = EntityGraphKindStyleRecordResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) {
        reportTransportValidationFailure(
          "entity-graph-kind-styles.saveEntityGraphKindStyle",
          parsed.error.issues,
        );
        throw new Error("The entity-graph kind style response was malformed.");
      }
      return parsed.data;
    },
  };

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-entity-graph-kind-styles-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveEntityGraphKindStylesTransport: () => Promise<EntityGraphKindStylesTransport> =
  createTransport(httpEntityGraphKindStylesTransport, () =>
    import("../../store/transport/native-entity-graph-kind-styles-backend").then(
      ({ createNativeEntityGraphKindStylesTransport }) =>
        createNativeEntityGraphKindStylesTransport(),
    ),
  );

/**
 * Every persisted entity-graph kind-style record for the project. Rejects on
 * any failure; never resolves to `[]` on a failed read.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function getEntityGraphKindStyles(
  projectId: string,
): Promise<EntityGraphKindStyleRecord[]> {
  const transport = await resolveEntityGraphKindStylesTransport();
  return transport.getEntityGraphKindStyles(projectId);
}

/**
 * Upserts a single kind's color-slot/shape style record. Rejects on any
 * failure.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param entityKind - The entity kind this style applies to (e.g.
 *   `"character"`).
 * @param color - One of the fixed token-slot references (e.g.
 *   `"entity-kind-0"`) — never a raw hex string.
 * @param shape - One of the fixed six shape names.
 */
export async function saveEntityGraphKindStyle(
  projectId: string,
  entityKind: string,
  color: EntityGraphKindColorSlot,
  shape: EntityGraphKindStyleRecord["shape"],
): Promise<EntityGraphKindStyleRecord> {
  const transport = await resolveEntityGraphKindStylesTransport();
  return transport.saveEntityGraphKindStyle(
    projectId,
    entityKind,
    color,
    shape,
  );
}
