/**
 * @module api/entity-cooccurrence
 *
 * Client transport for the project's per-entity co-occurrence map
 * (`specs/features/entity-cooccurrence.md`, FR-1): for every declared entity
 * that shares at least one resource with another declared entity's detected
 * mention, the set of entities it co-occurs with and how much. Degrades
 * gracefully: any failure yields the empty co-occurrence map `{}`, matching
 * how `lib/api/entity-mention-counts.ts` degrades on read failure.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { EntityCooccurrenceEntry } from "../models/mentions-core";

export type { EntityCooccurrenceEntry };

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021)
//
// One EntityCooccurrenceTransport contract with two implementations
// selected by the build-time runtime, mirroring lib/api/entity-mention-counts.ts:
//
// - Web/hosted/desktop -> httpEntityCooccurrenceTransport, which carries the
//   `fetch(...)` call against the Task 2 HTTP route.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-entity-cooccurrence-backend`),
//   dynamically imported only when `runtime === "native"`, reusing the
//   shared `getEntityCooccurrence` (`../models/mentions-core.ts`) instead
//   of HTTP. That module is created in this same task rather than a later
//   one, because Vite/Turbopack resolve a dynamic import()'s literal
//   specifier into the module graph regardless of whether the native branch
//   is taken — measured directly via `vitest` failing to load this module
//   with "Failed to resolve import" until the backend file exists (see that
//   file's doc comment, and `native-entity-mention-counts-backend.ts`'s
//   identical precedent). A later task remains responsible for the
//   `next.config.mjs` turbopack.resolveAlias substitution and the formal
//   native/web parity test.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The entity-cooccurrence-route-backed operation both platforms implement.
 * Shared with `../../store/transport/native-entity-cooccurrence-backend`,
 * which will import this type rather than duplicating it.
 */
export interface EntityCooccurrenceTransport {
  /**
   * Fetches the project's per-entity co-occurrence map. Degrades
   * gracefully: any failure yields `{}` rather than throwing.
   */
  getEntityCooccurrence(
    projectId: string,
  ): Promise<Record<string, EntityCooccurrenceEntry[]>>;
}

/** The empty co-occurrence map returned on any read failure. */
const EMPTY_COOCCURRENCE: Record<string, EntityCooccurrenceEntry[]> = {};

/**
 * HTTP transport — the hosted/desktop path. The method body below is the
 * `fetch` call against the Task 2 route, including a degrade-gracefully
 * try/catch.
 */
export const httpEntityCooccurrenceTransport: EntityCooccurrenceTransport = {
  async getEntityCooccurrence(projectId) {
    try {
      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/entity-cooccurrence`,
      );
      if (!response.ok) return EMPTY_COOCCURRENCE;
      return (await response.json()) as Record<
        string,
        EntityCooccurrenceEntry[]
      >;
    } catch {
      return EMPTY_COOCCURRENCE;
    }
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-entity-cooccurrence-backend")`
 * specifier so Turbopack's `resolveAlias` (`next.config.mjs`) can substitute
 * a `node:*`-free web-stub for it at build time.
 */
export const resolveEntityCooccurrenceTransport: () => Promise<EntityCooccurrenceTransport> =
  createTransport(httpEntityCooccurrenceTransport, () =>
    import("../../store/transport/native-entity-cooccurrence-backend").then(
      ({ createNativeEntityCooccurrenceTransport }) =>
        createNativeEntityCooccurrenceTransport(),
    ),
  );

/**
 * Fetches the project's per-entity co-occurrence map (FR-1).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The co-occurrence map, or `{}` on any failure.
 */
export async function getEntityCooccurrence(
  projectId: string,
): Promise<Record<string, EntityCooccurrenceEntry[]>> {
  const transport = await resolveEntityCooccurrenceTransport();
  return transport.getEntityCooccurrence(projectId);
}
