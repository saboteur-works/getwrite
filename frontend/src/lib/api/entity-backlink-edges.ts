/**
 * @module api/entity-backlink-edges
 *
 * Client transport for the project's derived entity-to-entity backlink edges
 * (Feature 68 Task 2/Task 7, FR-3): one edge per pair of declared entities
 * whose underlying resources are linked by an explicit backlink in either
 * direction. Degrades gracefully: any failure yields `[]`, matching
 * `lib/api/entity-cooccurrence.ts`'s precedent, since a missing backlink
 * edge only ever makes the graph show less, never something false. On a 2xx
 * response, the body is additionally validated against
 * `EntityBacklinkEdgesResponseSchema` (`./schemas.ts`) — a shape mismatch
 * reports via `reportTransportValidationFailure` and degrades to `[]`.
 *
 * HTTP-only for now (no native backend/`createTransport` collapse) — this
 * view is read-only and project-scoped like its co-occurrence/relationship
 * siblings, and native parity for the three new Task 7 edge reads is
 * deferred, consistent with Task 7's own task-list scope (its Files list
 * names only the view component, not new native backends).
 */
import { EntityBacklinkEdgesResponseSchema } from "./schemas";
import {
  reportTransportReadFailure,
  reportTransportValidationFailure,
} from "./transport-validation";

/** One derived backlink edge between two declared entities (unordered). */
export interface EntityBacklinkEdge {
  entityIds: [string, string];
}

/**
 * Fetches the project's derived entity-to-entity backlink edges.
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The backlink edges, or `[]` on any failure.
 */
export async function getEntityBacklinkEdges(
  projectId: string,
): Promise<EntityBacklinkEdge[]> {
  try {
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/entity-backlink-edges`,
    );
    if (!response.ok) {
      reportTransportReadFailure(
        "entity-backlink-edges.getEntityBacklinkEdges",
        { kind: "http", status: response.status },
      );
      return [];
    }
    const body: unknown = await response.json();
    const result = EntityBacklinkEdgesResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "entity-backlink-edges.getEntityBacklinkEdges",
        result.error.issues,
      );
      return [];
    }
    return result.data;
  } catch {
    reportTransportReadFailure("entity-backlink-edges.getEntityBacklinkEdges", {
      kind: "network",
    });
    return [];
  }
}
