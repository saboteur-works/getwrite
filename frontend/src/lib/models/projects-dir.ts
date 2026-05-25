import path from "node:path";

/**
 * Resolves the projects directory path.
 *
 * Checks `GETWRITE_PROJECTS_DIR` first (injected by Electron's main process)
 * and falls back to `../projects` relative to `process.cwd()` for the
 * standard pnpm-dev and standalone-server cases.
 */
export function resolveProjectsDir(): string {
  return (
    process.env.GETWRITE_PROJECTS_DIR ??
    path.join(process.cwd(), "..", "projects")
  );
}
