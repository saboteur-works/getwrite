import path from "node:path";
import { getStorageContext } from "./storage-context";

/**
 * Resolves the projects directory path using the legacy env/cwd rules,
 * ignoring any active request-scoped `StorageContext`.
 *
 * Checks `GETWRITE_PROJECTS_DIR` first (injected by Electron's main process)
 * and falls back to `../projects` relative to `process.cwd()` for the
 * standard pnpm-dev and standalone-server cases.
 *
 * Exported so callers that must bypass the ambient storage context — e.g.
 * the future `withStorageContext` helper that establishes a tenant root, or
 * CLI commands that always operate against the local filesystem — can reach
 * this resolution logic directly.
 */
export function defaultProjectsDir(): string {
  return (
    process.env.GETWRITE_PROJECTS_DIR ??
    path.join(process.cwd(), "..", "projects")
  );
}

/**
 * Resolves the projects directory path.
 *
 * This is the single documented entry point for locating the projects
 * directory. It first checks for an ambient `StorageContext` established
 * via `runInStorageContext` (see `storage-context.ts`) and, if present,
 * returns that context's `tenantRoot`. When no storage context is active —
 * e.g. in the Electron main process, local dev, or any code path that never
 * entered a storage context — it falls back to `defaultProjectsDir()`'s
 * legacy env/cwd resolution.
 */
export function resolveProjectsDir(): string {
  return getStorageContext()?.tenantRoot ?? defaultProjectsDir();
}
