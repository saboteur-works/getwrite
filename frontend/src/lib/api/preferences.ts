import type { ColorMode } from "../user-preferences";

/**
 * Persists per-project user preferences (currently: color mode).
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/preferences` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function saveProjectPreferences(
  projectId: string,
  preferences: { colorMode?: ColorMode },
): Promise<void> {
  await fetch("/api/project/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, preferences }),
  });
}

/**
 * Persists the default revision name used when creating new revisions.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/revision-settings` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function saveRevisionSettings(
  projectId: string,
  defaultRevisionName: string,
): Promise<{ defaultRevisionName?: string }> {
  const response = await fetch("/api/project/revision-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, defaultRevisionName }),
  });
  const body = (await response.json().catch(() => null)) as {
    defaultRevisionName?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to save default revision name.");
  }
  return body ?? {};
}
