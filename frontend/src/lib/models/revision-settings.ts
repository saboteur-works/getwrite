/**
 * @module revision-settings
 *
 * Persistence helpers for the project-level defaultRevisionName setting.
 */
import { updateProjectJson } from "./project-json-write";

/**
 * Writes the `defaultRevisionName` field into the project's `config` block and
 * updates `updatedAt`.
 *
 * @param projectPath - Absolute path to the project root directory.
 * @param name - New default revision name. Must be non-empty after trimming and
 *   at most 100 characters.
 * @returns The trimmed name that was persisted.
 * @throws {Error} If `name` is empty or exceeds 100 characters.
 */
export async function updateDefaultRevisionName(
  projectPath: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Revision name cannot be empty");
  }
  if (trimmed.length > 100) {
    throw new Error("Revision name too long (max 100 characters)");
  }

  return updateProjectJson(projectPath, (project) => {
    project.config = {
      ...(project.config ?? { editorConfig: {} }),
      defaultRevisionName: trimmed,
    };
    project.updatedAt = new Date().toISOString();
    return { result: trimmed };
  });
}
