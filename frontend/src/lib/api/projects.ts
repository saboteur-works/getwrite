import { z } from "zod";
import type { Project, Folder, AnyResource } from "../models/types";
import { createTransport } from "../../store/transport/create-transport";
import { ProjectApiEntrySchema, ProjectListEntrySchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export interface ProjectApiEntry {
  project: Project;
  folders: Folder[];
  resources: AnyResource[];
  /** `false`/absent for a normal entry; see `LockedProjectApiEntry` for `true`. */
  isLocked?: false;
  /** Present and `true` for an encrypted project, locked or not. */
  isEncrypted?: boolean;
}

/**
 * The reduced entry `GET /api/projects` returns for an encrypted project
 * whose workspace is locked (FR20, `project-crud-core.ts`'s
 * `ProjectListEntry`): only the project's `id` and the time it was
 * encrypted — no `name`, no resources, no folders, since nothing inside it
 * can be read while locked. Only a `list()` response can contain this
 * shape; `open`/`create` never return it (see `ProjectsTransport`).
 */
export interface LockedProjectApiEntry {
  project: { id: string; createdAt: string };
  folders: Folder[];
  resources: AnyResource[];
  isLocked: true;
  isEncrypted: true;
}

/**
 * The full response shape of a `list()` entry — a normal entry, or the
 * reduced locked entry above. `open`/`create` keep returning the narrower,
 * always-fully-populated `ProjectApiEntry`, since neither can return a
 * locked entry.
 */
export type ProjectListApiEntry = ProjectApiEntry | LockedProjectApiEntry;

function apiError(body: unknown, status: number): Error {
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `Status ${status}`;
  return new Error(message);
}

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021 Phase 2, Task 2)
//
// One ProjectsTransport contract with two implementations selected by the
// build-time runtime, mirroring revision-transport-service.ts:
//
// - Web/hosted/desktop -> httpProjectsTransport, which carries the original
//   `fetch(...)` calls byte-for-byte.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-project-backend`), dynamically imported
//   only when `runtime === "native"`, reusing the shared project CRUD core
//   (`../models/project-crud-core.ts`) instead of HTTP.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The project-route-backed operations both platforms implement. Shared with
 * `../../store/transport/native-project-backend`, which imports this type
 * rather than duplicating it.
 */
export interface ProjectsTransport {
  /** Lists every project under the projects directory. */
  list(): Promise<ProjectListApiEntry[]>;
  /** Opens (loads) a project by its on-disk directory id. */
  open(projectId: string): Promise<ProjectApiEntry>;
  /** Creates a new project from a project-type template. */
  create(name: string, projectType?: string): Promise<ProjectApiEntry>;
  /** Best-effort reindex of a project's missing resources. */
  reindex(projectId: string): Promise<void>;
}

/**
 * HTTP transport — the hosted/desktop path. Every method body below is the
 * original public function's `fetch` call verbatim; preserving it exactly is
 * what keeps the server build unchanged.
 */
export const httpProjectsTransport: ProjectsTransport = {
  async list() {
    const response = await fetch("/api/projects", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw apiError(body, response.status);
    }
    const body: unknown = await response.json();
    const result = z.array(ProjectListEntrySchema).safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure("projects.list", result.error.issues);
      throw new Error("projects.list: response failed validation");
    }
    return result.data as ProjectListApiEntry[];
  },

  async open(projectId) {
    const response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw apiError(body, response.status);
    }
    const body: unknown = await response.json();
    const result = ProjectApiEntrySchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure("projects.open", result.error.issues);
      throw new Error("projects.open: response failed validation");
    }
    return result.data as ProjectApiEntry;
  },

  async create(name, projectType) {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, projectType }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw apiError(body, response.status);
    }
    const body: unknown = await response.json();
    const result = ProjectApiEntrySchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure("projects.create", result.error.issues);
      throw new Error("projects.create: response failed validation");
    }
    return result.data as ProjectApiEntry;
  },

  async reindex(projectId) {
    await fetch(`/api/project/${projectId}/reindex`, { method: "POST" });
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-project-backend")` specifier so
 * Turbopack's `resolveAlias` (`next.config.mjs`) can substitute a
 * `node:*`-free web-stub for it at build time.
 */
export const resolveProjectsTransport: () => Promise<ProjectsTransport> =
  createTransport(httpProjectsTransport, () =>
    import("../../store/transport/native-project-backend").then(
      ({ createNativeProjectsTransport }) => createNativeProjectsTransport(),
    ),
  );

export async function listProjects(): Promise<ProjectListApiEntry[]> {
  const transport = await resolveProjectsTransport();
  return transport.list();
}

/**
 * Opens a project by its on-disk directory id.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function openProject(projectId: string): Promise<ProjectApiEntry> {
  const transport = await resolveProjectsTransport();
  return transport.open(projectId);
}

export async function createProject(
  name: string,
  projectType?: string,
): Promise<ProjectApiEntry> {
  const transport = await resolveProjectsTransport();
  return transport.create(name, projectType);
}

export async function reindexProject(projectId: string): Promise<void> {
  const transport = await resolveProjectsTransport();
  await transport.reindex(projectId);
}
