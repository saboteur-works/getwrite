/**
 * @module project-config
 *
 * Provides filesystem helpers for reading project-level configuration from
 * `project.json` at a project root.
 *
 * This module offers two read paths:
 * - {@link loadProject}: loads and validates the entire project document.
 * - {@link loadProjectConfig}: loads and validates only `config`.
 *
 * Both paths normalize configuration defaults via
 * `normalizeProjectConfig(...)` so callers can rely on a consistent shape.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ProjectConfigSchema, ProjectSchema, Infer } from "./schemas";
import type { ProjectConfig } from "./types";
import { normalizeProjectConfig } from "./project";

/**
 * Canonical filename for the persisted project document at project root.
 *
 * @example
 * const projectFile = path.join(projectRoot, PROJECT_FILENAME);
 */
export const PROJECT_FILENAME = "project.json";

/**
 * Reads `project.json`, validates the full document against `ProjectSchema`,
 * and normalizes `project.config` defaults.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A validated project object where `config` has defaults applied.
 * @throws {Error} If the file cannot be read from disk.
 * @throws {SyntaxError} If `project.json` contains invalid JSON.
 * @throws {import("zod").ZodError} If the parsed project does not match
 *   `ProjectSchema`.
 *
 * @example
 * const project = await loadProject("/projects/my-project");
 * console.log(project.name, project.config?.maxRevisions);
 */
export async function loadProject(
    projectRoot: string,
): Promise<Infer<typeof ProjectSchema>> {
    const p = path.join(projectRoot, PROJECT_FILENAME);
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    // Validate the overall project shape first.
    const project = ProjectSchema.parse(parsed);

    // Ensure config has sensible defaults applied.
    const normalizedConfig = normalizeProjectConfig(
        project.config as ProjectConfig | undefined,
    );
    return { ...project, config: normalizedConfig };
}

/**
 * Reads only the `config` section from `project.json`, validates it against
 * `ProjectConfigSchema`, and applies default values.
 *
 * Missing config is treated as `{}` before validation and normalization.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns Normalized `ProjectConfig` with defaults applied.
 * @throws {Error} If the file cannot be read from disk.
 * @throws {SyntaxError} If `project.json` contains invalid JSON.
 * @throws {import("zod").ZodError} If `config` does not match
 *   `ProjectConfigSchema`.
 *
 * @example
 * const config = await loadProjectConfig("/projects/my-project");
 * if (config.autoPrune) {
 *   // pruning behavior can proceed automatically
 * }
 */
export async function loadProjectConfig(
    projectRoot: string,
): Promise<ProjectConfig> {
    const p = path.join(projectRoot, PROJECT_FILENAME);
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as { config?: unknown } | undefined;

    const cfg = parsed?.config ?? {};
    // Validate config shape (will throw on invalid types)
    ProjectConfigSchema.parse(cfg);
    return normalizeProjectConfig(cfg as ProjectConfig);
}

/**
 * Convenience default export for consumers that prefer object-style imports.
 */
export default { loadProject, loadProjectConfig, PROJECT_FILENAME };
