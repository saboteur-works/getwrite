/**
 * @module api/saved-defaults-read
 *
 * Readers for the saved compile and export exclusions (Feature 101, FR-4).
 * The store's project record does not carry `compileDefaults` or
 * `exportDefaults`, so the dialogs read them fresh through the existing
 * project-open transport (`openProject`, which parses `config` with the keys
 * declared in `ApiProjectConfigSchema`). No new endpoint.
 *
 * Rejects on any failure (network error, non-2xx, malformed body); it never
 * turns a failed read into "no saved defaults". A locked project's rejection
 * is the transport's own error and is classified by the hook.
 */
import { openProject } from "./projects";

async function readExcluded(
  projectId: string,
  key: "compileDefaults" | "exportDefaults",
): Promise<string[] | undefined> {
  const entry = await openProject(projectId);
  return entry.project.config?.[key]?.excludedResourceIds;
}

/** Saved compile exclusions, or `undefined` when none are saved. */
export function readCompileDefaults(
  projectId: string,
): Promise<string[] | undefined> {
  return readExcluded(projectId, "compileDefaults");
}

/** Saved export exclusions, or `undefined` when none are saved. */
export function readExportDefaults(
  projectId: string,
): Promise<string[] | undefined> {
  return readExcluded(projectId, "exportDefaults");
}
