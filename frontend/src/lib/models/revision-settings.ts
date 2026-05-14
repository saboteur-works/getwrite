/**
 * @module revision-settings
 *
 * Persistence helpers for the project-level defaultRevisionName setting.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "./types";
import { PROJECT_FILENAME } from "./project-config";

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

    const filePath = path.join(projectPath, PROJECT_FILENAME);
    const raw = await fs.readFile(filePath, "utf8");
    const project = JSON.parse(raw) as Project;

    const nextProject: Project = {
        ...project,
        config: {
            ...(project.config ?? { editorConfig: {} }),
            defaultRevisionName: trimmed,
        },
        updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(filePath, JSON.stringify(nextProject, null, 2), "utf8");
    return trimmed;
}
