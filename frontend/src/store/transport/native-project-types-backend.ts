// Last Updated: 2026-07-26

/**
 * @module store/transport/native-project-types-backend
 *
 * **ADR-021 Phase 2 (Task 5).** The in-process implementation of
 * {@link ProjectTypesTransport} for a native (Capacitor) build: instead of
 * `fetch('/api/project-types')`, it reads the *same* static, build-time-
 * imported template registry `app/api/project-types/route.ts` now serves
 * (`lib/models/project-types-static.ts`, FR15) directly, in-process.
 *
 * This transport needs **no storage-context binding at all** — unlike every
 * other native backend in this file's directory, the project-types registry
 * is pure static data assembled once at module load from statically
 * `import`-ed JSON, with zero filesystem access of any kind (real or
 * adapter-backed). There is nothing to bind a `StorageContext` to, so this
 * module intentionally carries none of the `deps.fs`/`runInStorageContext`
 * scaffolding the other native backends use.
 *
 * This module is imported *only* on the native path (see
 * `lib/api/project-types.ts`'s dynamic import), because it pulls in the
 * project-types-static registry, which — while `node:*`-free itself — still
 * must never enter the web client bundle (see
 * `native-project-types-backend-web-exclusion.test.ts`).
 */
import { listStaticProjectTypes } from "../../lib/models/project-types-static";
import type { ProjectTypeDefinition } from "../../types/project-types";
import type {
  ProjectTypeList,
  ProjectTypesTransport,
  ProjectTypeWriteOutcome,
} from "../../lib/api/project-types";

/**
 * The native build keeps its static registry and has no saved directory, so
 * every write is refused as `saving-unavailable`: a value the caller shows,
 * with no request made.
 */
const SAVING_UNAVAILABLE: ProjectTypeWriteOutcome = {
  ok: false,
  reason: "saving-unavailable",
  message: "Saving project types is not available here.",
};

/**
 * Builds the in-process project-types transport for a native build. Takes
 * no dependencies — the static registry is pure data.
 */
export function createNativeProjectTypesTransport(): ProjectTypesTransport {
  return {
    async list(): Promise<ProjectTypeList> {
      const specs =
        listStaticProjectTypes() as unknown as ProjectTypeDefinition[];
      return {
        entries: specs.map((spec) => ({
          spec,
          fileName: `${spec.id}.json`,
          source: "built-in" as const,
        })),
        unusable: [],
        savedStatus: "not-configured",
      };
    },
    async create() {
      return SAVING_UNAVAILABLE;
    },
    async update() {
      return SAVING_UNAVAILABLE;
    },
    async remove() {
      return SAVING_UNAVAILABLE;
    },
  };
}
