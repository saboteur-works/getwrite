/**
 * @module project-json-write
 *
 * One read-modify-write of a project's `project.json`, serialized with every
 * other writer that takes the per-file lock (`file-lock.ts`) for the same
 * file, and written atomically.
 *
 * The lock key is the resolved path of `project.json`, so the read the
 * mutation is based on is never older than the previous writer's write. This
 * lock is innermost (Feature 92, FR-8): the callback must not take
 * `withFileLock`, `withMetaLock`, `acquireLock` or any other lock, and this
 * function does not take `withMetaLock` itself. A caller may hold an outer
 * lock such as `withMetaLock(projectRoot, ...)` or `acquireLock(projectRoot)`.
 *
 * Two unlocked plain writes at once interleaved and left `project.json`
 * unparseable, which makes the project unopenable: two concurrent
 * `updateEditorConfigCore` calls (headings and body) produced
 * "Unexpected non-whitespace character after JSON" on the first of 20
 * repetitions in `tests/unit/metadata-concurrent-writes.test.ts`.
 */
import path from "node:path";
import { withFileLock } from "./file-lock";
import { atomicWriteFile, readFile } from "./io";
import { PROJECT_FILENAME } from "./project-config";
import type { Project } from "./types";

/** What a mutation returns: its result, and whether to write the project. */
export interface ProjectJsonMutation<T> {
  result: T;
  /** False leaves `project.json` untouched. Defaults to true. */
  shouldWrite?: boolean;
}

/** Options for {@link updateProjectJson}. */
export interface UpdateProjectJsonOptions {
  /**
   * When true, the write is the durable form of `atomicWriteFile` (the temp
   * file is fsynced before the rename). Defaults to false: the write is the
   * plain atomic write.
   */
  durable?: boolean;
}

/**
 * Reads `project.json`, lets `mutate` change the parsed project in place, and
 * writes it back atomically, all under the per-file lock for `project.json`.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param mutate - Changes the project in place and returns the caller's
 *   result. A throw writes nothing.
 * @param options - See {@link UpdateProjectJsonOptions}.
 * @returns The mutation's result.
 */
export async function updateProjectJson<T>(
  projectRoot: string,
  mutate: (
    project: Project,
  ) => ProjectJsonMutation<T> | Promise<ProjectJsonMutation<T>>,
  options: UpdateProjectJsonOptions = {},
): Promise<T> {
  const projectPath = path.join(projectRoot, PROJECT_FILENAME);
  return withFileLock(projectPath, async () => {
    const project = JSON.parse(await readFile(projectPath, "utf8")) as Project;
    const { result, shouldWrite = true } = await mutate(project);
    if (shouldWrite) {
      await atomicWriteFile(
        projectPath,
        JSON.stringify(project, null, 2),
        options.durable === true
          ? { writeOptions: "utf8", durable: true }
          : "utf8",
      );
    }
    return result;
  });
}
