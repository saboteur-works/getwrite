/**
 * @module api/entity-mention-counts
 *
 * Client transport for the project's per-entity mention counts
 * (`specs/features/entity-roster.md`, FR-6): the total number of detected
 * mentions recorded anywhere in the project's mention index for every
 * entity that has at least one. Degrades gracefully: any failure yields the
 * empty counts map `{}`, matching how `lib/api/entity-alias-table.ts`
 * degrades on read failure.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { EntityMentionCounts } from "../models/mentions-core";

export type { EntityMentionCounts };

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021)
//
// One EntityMentionCountsTransport contract with two implementations
// selected by the build-time runtime, mirroring lib/api/entity-alias-table.ts:
//
// - Web/hosted/desktop -> httpEntityMentionCountsTransport, which carries the
//   `fetch(...)` call against the Task 2 HTTP route.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-entity-mention-counts-backend`),
//   dynamically imported only when `runtime === "native"`, reusing the
//   shared `getProjectMentionCounts` (`../models/mentions-core.ts`) instead
//   of HTTP. That native backend is a later task and does not exist yet —
//   this module only reserves its literal specifier.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The entity-mention-counts-route-backed operation both platforms implement.
 * Shared with `../../store/transport/native-entity-mention-counts-backend`,
 * which will import this type rather than duplicating it.
 */
export interface EntityMentionCountsTransport {
  /**
   * Fetches the project's per-entity mention counts. Degrades gracefully:
   * any failure yields `{}` rather than throwing.
   */
  getEntityMentionCounts(
    projectId: string,
  ): Promise<Record<string, EntityMentionCounts>>;
}

/** The empty counts map returned on any read failure. */
const EMPTY_MENTION_COUNTS: Record<string, EntityMentionCounts> = {};

/**
 * HTTP transport — the hosted/desktop path. The method body below is the
 * `fetch` call against the Task 2 route, including a degrade-gracefully
 * try/catch.
 */
export const httpEntityMentionCountsTransport: EntityMentionCountsTransport = {
  async getEntityMentionCounts(projectId) {
    try {
      const response = await fetch(
        `/api/project/${encodeURIComponent(projectId)}/entity-mention-counts`,
      );
      if (!response.ok) return EMPTY_MENTION_COUNTS;
      return (await response.json()) as Record<string, EntityMentionCounts>;
    } catch {
      return EMPTY_MENTION_COUNTS;
    }
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-entity-mention-counts-backend")`
 * specifier so Turbopack's `resolveAlias` (`next.config.mjs`) can substitute
 * a `node:*`-free web-stub for it at build time.
 */
export const resolveEntityMentionCountsTransport: () => Promise<EntityMentionCountsTransport> =
  createTransport(httpEntityMentionCountsTransport, () =>
    import("../../store/transport/native-entity-mention-counts-backend").then(
      ({ createNativeEntityMentionCountsTransport }) =>
        createNativeEntityMentionCountsTransport(),
    ),
  );

/**
 * Fetches the project's per-entity mention counts (FR-6).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The counts map, or `{}` on any failure.
 */
export async function getEntityMentionCounts(
  projectId: string,
): Promise<Record<string, EntityMentionCounts>> {
  const transport = await resolveEntityMentionCountsTransport();
  return transport.getEntityMentionCounts(projectId);
}
