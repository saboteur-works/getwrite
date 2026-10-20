import type { ProjectTypeDefinition } from "../../types/project-types";
import { ProjectTypeListResponseSchema } from "./schemas";
import { createTransport } from "../../store/transport/create-transport";
import { reportTransportValidationFailure } from "./transport-validation";

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021 Phase 2, Task 5)
//
// One ProjectTypesTransport contract with two implementations selected by
// the build-time runtime, mirroring lib/api/projects.ts:
//
// - Web/hosted/desktop -> httpProjectTypesTransport, which carries the
//   original `fetch(...)` call verbatim.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-project-types-backend`), dynamically
//   imported only when `runtime === "native"`, reading the static,
//   build-time-imported template registry
//   (`../models/project-types-static.ts`) instead of HTTP — this transport
//   needs no storage-context binding at all, since the registry is pure
//   static data with zero filesystem access.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

export type ProjectTypeSource = "built-in" | "saved";
export type ProjectTypeUnusableReason =
  | "unparseable"
  | "invalid"
  | "unreadable";
export type SavedProjectTypesStatus = "ok" | "not-configured" | "unreadable";

/** One listed project type with where it came from (Feature 90, FR-6). */
export interface ProjectTypeListEntry {
  spec: ProjectTypeDefinition;
  fileName: string;
  source: ProjectTypeSource;
}

/**
 * What `list()` returns on every platform: the merged entries, the saved
 * files that could not be used (name and short reason only) and the status of
 * the saved directory. The native static registry returns the same shape with
 * built-in entries, no unusable files and `not-configured`.
 */
export interface ProjectTypeList {
  entries: ProjectTypeListEntry[];
  unusable: { fileName: string; reason: ProjectTypeUnusableReason }[];
  savedStatus: SavedProjectTypesStatus;
}

/**
 * One-line notice for a list that lost saved types, or null when there is
 * nothing to tell the writer. `not-configured` is not a failure (saving is
 * simply unavailable) so it yields no notice. Rendering is the callers' job.
 */
export function projectTypeListNotice(list: ProjectTypeList): string | null {
  if (list.savedStatus === "unreadable") {
    return "Saved project types could not be read.";
  }
  if (list.unusable.length > 0) {
    const n = list.unusable.length;
    return `${n} saved project type ${n === 1 ? "file" : "files"} could not be used.`;
  }
  return null;
}

/**
 * The project-types-route-backed operation both platforms implement. Shared
 * with `../../store/transport/native-project-types-backend`, which imports
 * this type rather than duplicating it.
 */
export interface ProjectTypesTransport {
  /** Lists every available project-type template with its notice data. */
  list(): Promise<ProjectTypeList>;
}

/**
 * HTTP transport. A body that fails the list-response schema is reported and
 * thrown, never returned as an empty list.
 */
export const httpProjectTypesTransport: ProjectTypesTransport = {
  async list() {
    const response = await fetch("/api/project-types");
    if (!response.ok) {
      throw new Error(`Failed to load project types (${response.status})`);
    }
    const body: unknown = await response.json();
    const result = ProjectTypeListResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "project-types.list",
        result.error.issues,
      );
      throw new Error("Invalid project types response shape");
    }
    return result.data as ProjectTypeList;
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-project-types-backend")` specifier
 * so Turbopack's `resolveAlias` (`next.config.mjs`) can substitute a
 * `node:*`-free web-stub for it at build time.
 */
export const resolveProjectTypesTransport: () => Promise<ProjectTypesTransport> =
  createTransport(httpProjectTypesTransport, () =>
    import("../../store/transport/native-project-types-backend").then(
      ({ createNativeProjectTypesTransport }) =>
        createNativeProjectTypesTransport(),
    ),
  );

/** The full list, including `unusable` and `savedStatus` for the notice. */
export async function listProjectTypeEntries(): Promise<ProjectTypeList> {
  const transport = await resolveProjectTypesTransport();
  return transport.list();
}

/** The specs alone, for callers that need no notice. */
export async function listProjectTypes(): Promise<ProjectTypeDefinition[]> {
  return (await listProjectTypeEntries()).entries.map((e) => e.spec);
}
