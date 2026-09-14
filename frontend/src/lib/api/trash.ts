/**
 * @module api/trash
 *
 * Client transport for the project-wide Trash view (`specs/features/trash-ui.md`
 * FR-1/FR-2/FR-11/FR-12/FR-18, Task 11's routes). Mirrors
 * `lib/api/entity-relationships.ts`'s exact pattern: one `TrashTransport`
 * interface, one HTTP implementation, and a `createTransport`-resolved
 * dispatcher.
 *
 * Degrade-vs-throw contract for all three operations — REJECT on any failure
 * (network error, non-2xx response, or a malformed body), none of them
 * degrade to an empty/no-op result:
 *
 * - `listTrash` is the Trash view's *entire* content, not a supplementary
 *   panel the way `entity-cooccurrence.ts`'s degrade-to-`[]` list is. A
 *   degrade-to-`{ resources: [], folders: [] }` on a load failure would
 *   render as "Trash is empty" — indistinguishable from the real empty
 *   state — which would be actively misleading for a view whose entire job
 *   is telling a writer whether their deleted content is still recoverable.
 *   So, unlike `listEntityRelationships`, this one throws rather than
 *   degrading; there is no companion "OrThrow" variant because the plain
 *   function already has to be the throwing one.
 * - `restoreTrashItems`/`purgeTrashItems` both return one outcome per
 *   requested id (`ok`/`error` per item, resolved OQ-9) — the routes
 *   themselves never fail a whole batch just because one item did. That
 *   per-item reporting is exactly the situation `listEntityRelationships`'s
 *   own doc comment flags as a candidate for a throwing variant: a caller
 *   needs to tell "the request reached the server and these are its
 *   authoritative per-item results" apart from "the request never got a
 *   response at all, so these results don't exist." Degrading a transport
 *   failure to `[]` (or to synthesized `{ ok: false }` entries for every
 *   requested id) would look identical to a real per-item batch outcome to
 *   a caller that just checks each result's `ok` flag, silently reporting
 *   items as "failed to restore/purge" when in fact the request never ran.
 *   So both reject on transport failure instead.
 */
import { createTransport } from "../../store/transport/create-transport";
import type {
  RestoredReferenceInfo,
  TrashedFolderEntry,
  TrashedResourceEntry,
} from "../models/trash";

export type { RestoredReferenceInfo, TrashedFolderEntry, TrashedResourceEntry };

/** Combined response shape of `GET /api/project/:id/trash`. */
export interface TrashListing {
  resources: TrashedResourceEntry[];
  folders: TrashedFolderEntry[];
}

/** One id's outcome from a batch restore (`POST .../trash/restore`). */
export interface RestoreItemResult {
  id: string;
  ok: boolean;
  relocated?: boolean;
  renamed?: boolean;
  referencesNotRestored?: RestoredReferenceInfo[] | "no-record";
  error?: string;
}

/** One id's outcome from a batch purge (`POST .../trash/purge`). */
export interface PurgeItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * A batch purge selects either an explicit list of ids, or `{ all: true }`
 * for "Empty trash" (every currently trashed top-level id, resolved by the
 * route itself via `listTrashedItems` before any deletion runs).
 */
export type PurgeSelection = string[] | { all: true };

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021)
//
// One TrashTransport contract with two implementations selected by the
// build-time runtime, mirroring lib/api/entity-relationships.ts:
//
// - Web/hosted/desktop -> httpTrashTransport, which carries the `fetch(...)`
//   calls against Task 11's routes.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-trash-backend`), dynamically imported
//   only when `runtime === "native"`. Its real implementation is deferred
//   (out of scope for this task): the module exists so the dynamic import's
//   literal specifier resolves at build/typecheck time (the same
//   already-documented Turbopack/tsc constraint `entity-relationships.ts`'s
//   own doc comment explains), but every method it exports rejects with a
//   "not supported on this platform" error until a later task fills it in.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The trash-route-backed operations both platforms implement. Shared with
 * `../../store/transport/native-trash-backend`, which imports this type
 * rather than duplicating it.
 */
export interface TrashTransport {
  /**
   * Lists every currently trashed resource and top-level trashed folder.
   * REJECTS on any failure (network error, non-2xx response, or a malformed
   * body) — see this module's doc comment for why this one doesn't degrade.
   */
  list(projectId: string): Promise<TrashListing>;

  /**
   * Restores a batch of trashed items by id. Resolves the per-item results
   * array on success; REJECTS on any transport failure (network error,
   * non-2xx response, or a malformed body) rather than synthesizing
   * per-item failures — see this module's doc comment.
   */
  restore(projectId: string, ids: string[]): Promise<RestoreItemResult[]>;

  /**
   * Permanently purges a batch of trashed items, by id or via `{ all: true }`
   * ("Empty trash"). Resolves the per-item results array on success;
   * REJECTS on any transport failure — see this module's doc comment.
   */
  purge(
    projectId: string,
    selection: PurgeSelection,
  ): Promise<PurgeItemResult[]>;
}

/**
 * HTTP transport — the hosted/desktop path. Hits Task 11's routes:
 * `GET /api/project/{projectId}/trash`,
 * `POST /api/project/{projectId}/trash/restore`, and
 * `POST /api/project/{projectId}/trash/purge`.
 */
export const httpTrashTransport: TrashTransport = {
  async list(projectId) {
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/trash`,
    );
    if (!response.ok) {
      throw new Error(`Failed to load trash (status ${response.status}).`);
    }
    const data = (await response.json()) as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { resources?: unknown }).resources) ||
      !Array.isArray((data as { folders?: unknown }).folders)
    ) {
      throw new Error("Malformed trash listing response.");
    }
    return data as TrashListing;
  },

  async restore(projectId, ids) {
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/trash/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to restore trash items (status ${response.status}).`,
      );
    }
    const data = (await response.json()) as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { results?: unknown }).results)
    ) {
      throw new Error("Malformed trash restore response.");
    }
    return (data as { results: RestoreItemResult[] }).results;
  },

  async purge(projectId, selection) {
    const body = Array.isArray(selection) ? { ids: selection } : { all: true };
    const response = await fetch(
      `/api/project/${encodeURIComponent(projectId)}/trash/purge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to purge trash items (status ${response.status}).`,
      );
    }
    const data = (await response.json()) as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { results?: unknown }).results)
    ) {
      throw new Error("Malformed trash purge response.");
    }
    return (data as { results: PurgeItemResult[] }).results;
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-trash-backend")` specifier so
 * Turbopack's `resolveAlias` (`next.config.mjs`) can substitute a
 * `node:*`-free web-stub for it at build time.
 */
export const resolveTrashTransport: () => Promise<TrashTransport> =
  createTransport(httpTrashTransport, () =>
    import("../../store/transport/native-trash-backend").then(
      ({ createNativeTrashTransport }) => createNativeTrashTransport(),
    ),
  );

/**
 * Lists every currently trashed resource and top-level trashed folder
 * (FR-1/FR-2/FR-11/FR-12).
 *
 * @param projectId - The project's on-disk directory basename.
 * @returns The combined listing on success; rejects on any failure.
 */
export async function listTrash(projectId: string): Promise<TrashListing> {
  const transport = await resolveTrashTransport();
  return transport.list(projectId);
}

/**
 * Restores a batch of trashed items by id (FR-1/FR-2).
 *
 * @param projectId - The project's on-disk directory basename.
 * @param ids - The trashed item ids (resources and/or top-level folders) to restore.
 * @returns One outcome per requested id on success; rejects on any transport failure.
 */
export async function restoreTrashItems(
  projectId: string,
  ids: string[],
): Promise<RestoreItemResult[]> {
  const transport = await resolveTrashTransport();
  return transport.restore(projectId, ids);
}

/**
 * Permanently purges a batch of trashed items (FR-1/FR-2/FR-18), by id or
 * via `{ all: true }` for "Empty trash".
 *
 * @param projectId - The project's on-disk directory basename.
 * @param selection - Either the trashed item ids to purge, or `{ all: true }`.
 * @returns One outcome per purged id on success; rejects on any transport failure.
 */
export async function purgeTrashItems(
  projectId: string,
  selection: PurgeSelection,
): Promise<PurgeItemResult[]> {
  const transport = await resolveTrashTransport();
  return transport.purge(projectId, selection);
}
