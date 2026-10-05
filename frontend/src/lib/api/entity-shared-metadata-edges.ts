/**
 * @module api/entity-shared-metadata-edges
 *
 * Client transport for the project's derived shared-metadata edges (Feature
 * 68 Task 4/Task 7, FR-5): one edge per pair of declared entities sharing at
 * least one tag or one identical custom metadata field value. Degrades
 * gracefully: any failure yields `[]`, mirroring
 * `lib/api/entity-backlink-edges.ts`'s precedent. On a 2xx response, the
 * body is additionally validated against
 * `SharedMetadataEdgesResponseSchema` (`./schemas.ts`) — a shape mismatch
 * reports via `reportTransportValidationFailure` and degrades to `[]`.
 *
 * HTTP-only for now — see `entity-backlink-edges.ts`'s doc comment for why
 * no native backend/`createTransport` collapse is added in this task.
 */
import { SharedMetadataEdgesResponseSchema } from "./schemas";
import {
  reportTransportReadFailure,
  reportTransportValidationFailure,
} from "./transport-validation";

/**
 * One derived edge between two declared entities sharing at least one tag
 * or one identical custom metadata field value.
 */
export interface SharedMetadataEdge {
  entityIdA: string;
  entityIdB: string;
  sharedTagIds: string[];
  sharedFieldKeys: string[];
}

/**
 * Fetches the project's derived shared-metadata edges.
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The shared-metadata edges, or `[]` on any failure.
 */
export async function getEntitySharedMetadataEdges(
  projectId: string,
): Promise<SharedMetadataEdge[]> {
  try {
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/entity-shared-metadata-edges`,
    );
    if (!response.ok) {
      reportTransportReadFailure(
        "entity-shared-metadata-edges.getEntitySharedMetadataEdges",
        { kind: "http", status: response.status },
      );
      return [];
    }
    const body: unknown = await response.json();
    const result = SharedMetadataEdgesResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "entity-shared-metadata-edges.getEntitySharedMetadataEdges",
        result.error.issues,
      );
      return [];
    }
    return result.data;
  } catch {
    reportTransportReadFailure(
      "entity-shared-metadata-edges.getEntitySharedMetadataEdges",
      { kind: "network" },
    );
    return [];
  }
}
