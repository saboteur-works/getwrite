// Last Updated: 2026-03-11

/**
 * @module test/helpers/project-creator
 *
 * Unit-test helper for creating projects from project-type specs and asserting
 * baseline invariants expected by tests.
 *
 * This helper centralizes common setup checks so individual tests can focus on
 * behavior-specific assertions rather than repeating filesystem/sidecar
 * validation boilerplate.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    createProjectFromType,
    type ProjectTypeSpec,
} from "../../../../src/lib/models/project-creator";
import { readSidecar } from "../../../../src/lib/models/sidecar";
import { validateProject } from "../../../../src/lib/models/project";
import type {
    Folder as FolderType,
    TextResource,
} from "../../../../src/lib/models/types";

/**
 * Return shape for {@link createAndAssertProject}.
 */
export interface CreateAndAssertResult {
    /** Absolute path to the created project root directory. */
    projectPath: string;
    /** Folder models created while scaffolding the project. */
    folders: FolderType[];
    /** Text resources created while scaffolding the project. */
    resources: TextResource[];
}

/**
 * Optional arguments controlling how the project is created for a test.
 */
export interface CreateAndAssertProjectOptions {
    /**
     * Explicit root path to create the project in.
     *
     * When omitted, a temporary directory is created via `fs.mkdtemp`.
     */
    projectRoot?: string;
    /**
     * Optional project name override passed to `createProjectFromType`.
     */
    name?: string;
}

/**
 * Creates a project from a project-type spec and asserts baseline invariants.
 *
 * The helper accepts either:
 * - a path to a JSON project-type spec file, or
 * - an in-memory `ProjectTypeSpec` object.
 *
 * After project creation, it verifies:
 * 1. The generated project passes runtime validation (`validateProject`).
 * 2. At least one folder entry exists on disk under `folders/`.
 * 3. Every created resource has a corresponding sidecar file.
 *
 * @param specOrPath - Project-type spec as an object or file path.
 * @param opts - Optional project root and project name override.
 * @returns Created project path, folder models, and text resources for
 *   downstream assertions.
 * @throws {Error} If folder creation assertions fail.
 * @throws {Error} If any created resource is missing its sidecar.
 *
 * @example
 * ```ts
 * const result = await createAndAssertProject("./fixtures/novel.json", {
 *   name: "My Test Project",
 * });
 * expect(result.resources.length).toBeGreaterThan(0);
 * ```
 */
export async function createAndAssertProject(
    specOrPath: unknown | string,
    opts?: CreateAndAssertProjectOptions,
): Promise<CreateAndAssertResult> {
    const projectRoot =
        opts?.projectRoot ??
        (await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-helpers-")));

    // Pass spec path through to createProjectFromType when given a string.
    // This allows the implementation to read and validate the JSON file itself.
    let specObj: string | ProjectTypeSpec;
    if (typeof specOrPath === "string") {
        specObj = path.isAbsolute(specOrPath)
            ? specOrPath
            : path.resolve(specOrPath);
    } else {
        specObj = specOrPath as ProjectTypeSpec;
    }

    // console.log(
    //     "createAndAssertProject: calling createProjectFromType with spec:",
    //     specObj,
    // );
    const { project, folders, resources } = await createProjectFromType({
        projectRoot,
        spec: specObj,
        name: opts?.name,
    });

    // Validate project shape using runtime validator
    validateProject(project);

    // Basic filesystem assertions
    const foldersDir = path.join(projectRoot, "folders");
    const folderEntries = await fs.readdir(foldersDir);
    if (folderEntries.length < 1) {
        throw new Error("expected at least one folder to be created");
    }

    // Ensure sidecars exist for resources that were created
    for (const r of resources) {
        const meta = await readSidecar(projectRoot, r.id);
        if (meta === null) {
            throw new Error(`missing sidecar for resource ${r.id}`);
        }
    }

    return { projectPath: projectRoot, folders, resources };
}

export default { createAndAssertProject };
