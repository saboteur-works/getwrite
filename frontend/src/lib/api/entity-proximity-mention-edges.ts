/**
 * @module api/entity-proximity-mention-edges
 *
 * Client transport for the project's derived proximity-mention edges
 * (Feature 68 Task 3/Task 7, FR-4): for every declared entity, every other
 * declared entity it is mentioned alongside in at least one shared resource,
 * weighted by the averaged character-offset distance between their mentions
 * in that resource. Degrades gracefully: any failure yields `{}`, mirroring
 * `lib/api/entity-cooccurrence.ts`'s precedent for the structurally
 * identical per-entity-keyed shape. On a 2xx response, the body is
 * additionally validated against `ProximityMentionEdgesResponseSchema`
 * (`./schemas.ts`) — a shape mismatch reports via
 * `reportTransportValidationFailure` and degrades to `{}`.
 *
 * HTTP-only for now — see `entity-backlink-edges.ts`'s doc comment for why
 * no native backend/`createTransport` collapse is added in this task.
 */
import { ProximityMentionEdgesResponseSchema } from "./schemas";
import {
  reportTransportReadFailure,
  reportTransportValidationFailure,
} from "./transport-validation";

/**
 * One derived proximity-mention edge, from the owning entity's perspective,
 * to `entityId` in a shared `resourceId`, weighted by averaged character
 * distance (smaller is closer/stronger).
 */
export interface ProximityMentionEdge {
  entityId: string;
  resourceId: string;
  weight: number;
}

/** The empty proximity-mention map returned on any read failure. */
const EMPTY_PROXIMITY_MENTIONS: Record<string, ProximityMentionEdge[]> = {};

/**
 * Fetches the project's derived proximity-mention edges.
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The per-entity proximity-mention map, or `{}` on any failure.
 */
export async function getProximityMentionEdges(
  projectId: string,
): Promise<Record<string, ProximityMentionEdge[]>> {
  try {
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/entity-proximity-mention-edges`,
    );
    if (!response.ok) {
      reportTransportReadFailure(
        "entity-proximity-mention-edges.getProximityMentionEdges",
        { kind: "http", status: response.status },
      );
      return EMPTY_PROXIMITY_MENTIONS;
    }
    const body: unknown = await response.json();
    const result = ProximityMentionEdgesResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "entity-proximity-mention-edges.getProximityMentionEdges",
        result.error.issues,
      );
      return EMPTY_PROXIMITY_MENTIONS;
    }
    return result.data;
  } catch {
    reportTransportReadFailure(
      "entity-proximity-mention-edges.getProximityMentionEdges",
      { kind: "network" },
    );
    return EMPTY_PROXIMITY_MENTIONS;
  }
}
