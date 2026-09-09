/**
 * @module api/entity-relationships
 *
 * Client transport for authored, typed relationship edges between two
 * declared entities (`specs/features/entity-relationships.md`, FR-1/FR-2/
 * FR-6/FR-8). Every method degrades gracefully rather than throwing, so a
 * caller in the sidebar UI never needs a try/catch of its own:
 *
 * - `list` resolves to `[]` on ANY failure (network error, non-2xx, or a
 *   malformed body), mirroring `lib/api/entity-cooccurrence.ts`'s
 *   degrade-to-empty-map floor.
 * - `create` resolves to `null` on failure rather than throwing, mirroring
 *   the fire-and-forget-with-signal shape `updateSidecar`/
 *   `assignTagToResource`'s callers already tolerate.
 * - `remove` resolves to `true`/`false` matching the route's success/
 *   not-found response, and resolves `false` (never throws) on a network
 *   error.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { EntityRelationshipEdge } from "../models/entity-relationships";

export type { EntityRelationshipEdge };

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021)
//
// One EntityRelationshipsTransport contract with two implementations
// selected by the build-time runtime, mirroring lib/api/entity-cooccurrence.ts
// and lib/api/tags.ts:
//
// - Web/hosted/desktop -> httpEntityRelationshipsTransport, which carries the
//   `fetch(...)` calls against Task 3's routes.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-entity-relationships-backend`),
//   dynamically imported only when `runtime === "native"`, reusing the
//   shared `entity-relationships.ts` model functions instead of HTTP. That
//   module does not exist yet — it is Task 5's responsibility — but the
//   dynamic import's literal specifier must be reserved here regardless,
//   since Turbopack/Vite resolve a dynamic import()'s literal specifier into
//   the module graph at build/typecheck time whether or not the native
//   branch is ever taken (the precedent already documented in
//   `entity-cooccurrence.ts`'s own doc comment).
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The entity-relationships-route-backed operations both platforms
 * implement. Shared with
 * `../../store/transport/native-entity-relationships-backend`, which will
 * import this type rather than duplicating it.
 */
export interface EntityRelationshipsTransport {
  /**
   * Lists every persisted relationship edge for the project. Degrades
   * gracefully: any failure (network error, non-2xx response, or a
   * malformed body) yields `[]` rather than throwing.
   */
  list(projectId: string): Promise<EntityRelationshipEdge[]>;

  /**
   * Creates a directed, typed edge from `sourceEntityId` to
   * `targetEntityId`. Resolves the created (or, per FR-17, the pre-existing
   * matching) edge on success, or `null` on any failure — including the
   * server's FR-4/FR-15 validation rejections — rather than throwing.
   */
  create(
    projectId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relationshipType: string,
  ): Promise<EntityRelationshipEdge | null>;

  /**
   * Removes exactly the edge with the given `edgeId`. Resolves `true` if an
   * edge was removed, `false` if no such edge existed or the request
   * otherwise failed (including a network error) — never throws.
   */
  remove(projectId: string, edgeId: string): Promise<boolean>;
}

/**
 * HTTP transport — the hosted/desktop path. Hits Task 3's routes:
 * `GET/POST /api/project/{projectId}/entity-relationships` and
 * `POST /api/project/{projectId}/entity-relationships/remove`.
 */
export const httpEntityRelationshipsTransport: EntityRelationshipsTransport = {
  async list(projectId) {
    try {
      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/entity-relationships`,
      );
      if (!response.ok) return [];
      const data = (await response.json()) as unknown;
      return Array.isArray(data) ? (data as EntityRelationshipEdge[]) : [];
    } catch {
      return [];
    }
  },

  async create(projectId, sourceEntityId, targetEntityId, relationshipType) {
    try {
      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/entity-relationships`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceEntityId,
            targetEntityId,
            relationshipType,
          }),
        },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as EntityRelationshipEdge;
      return data ?? null;
    } catch {
      return null;
    }
  },

  async remove(projectId, edgeId) {
    try {
      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/entity-relationships/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edgeId }),
        },
      );
      if (!response.ok) return false;
      const data = (await response.json()) as { removed?: boolean };
      return data.removed === true;
    } catch {
      return false;
    }
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-entity-relationships-backend")`
 * specifier so Turbopack's `resolveAlias` (`next.config.mjs`) can substitute
 * a `node:*`-free web-stub for it at build time (Task 5).
 */
export const resolveEntityRelationshipsTransport: () => Promise<EntityRelationshipsTransport> =
  createTransport(httpEntityRelationshipsTransport, () =>
    import("../../store/transport/native-entity-relationships-backend").then(
      ({ createNativeEntityRelationshipsTransport }) =>
        createNativeEntityRelationshipsTransport(),
    ),
  );

/**
 * Lists every persisted relationship edge for the project (FR-5).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns Every persisted edge, or `[]` on any failure.
 */
export async function listEntityRelationships(
  projectId: string,
): Promise<EntityRelationshipEdge[]> {
  const transport = await resolveEntityRelationshipsTransport();
  return transport.list(projectId);
}

/**
 * Creates a directed, typed edge from `sourceEntityId` to `targetEntityId`
 * (FR-2).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The created (or pre-existing matching, per FR-17) edge, or `null`
 *   on any failure.
 */
export async function createEntityRelationship(
  projectId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
): Promise<EntityRelationshipEdge | null> {
  const transport = await resolveEntityRelationshipsTransport();
  return transport.create(
    projectId,
    sourceEntityId,
    targetEntityId,
    relationshipType,
  );
}

/**
 * Removes exactly the edge with the given `edgeId` (FR-6/FR-12).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns `true` if an edge was removed, `false` otherwise (not found, or
 *   the request failed).
 */
export async function removeEntityRelationship(
  projectId: string,
  edgeId: string,
): Promise<boolean> {
  const transport = await resolveEntityRelationshipsTransport();
  return transport.remove(projectId, edgeId);
}
