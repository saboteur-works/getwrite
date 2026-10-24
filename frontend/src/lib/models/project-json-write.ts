/**
 * @module project-json-write
 *
 * One read-modify-write of a project's `project.json`, serialized with every
 * other `withMetaLock(projectRoot, ...)` writer and written atomically.
 *
 * Two unlocked plain writes at once interleaved and left `project.json`
 * unparseable, which makes the project unopenable: two concurrent
 * `updateEditorConfigCore` calls (headings and body) produced
 * "Unexpected non-whitespace character after JSON" on the first of 20
 * repetitions in `tests/unit/metadata-concurrent-writes.test.ts`.
 *
 * Do not call this from inside `withMetaLock(projectRoot, ...)`: the lock is
 * not reentrant.
 */
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { PROJECT_FILENAME } from "./project-config";
import type { Project } from "./types";

/** What a mutation returns: its result, and whether to write the project. */
export interface ProjectJsonMutation<T> {
  result: T;
  /** False leaves `project.json` untouched. Defaults to true. */
  shouldWrite?: boolean;
}

/**
 * Reads `project.json`, lets `mutate` change the parsed project in place, and
 * writes it back atomically, all under the project's meta lock.
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @param mutate - Changes the project in place and returns the caller's
 *   result. A throw writes nothing.
 * @returns The mutation's result.
 */
export async function updateProjectJson<T>(
  projectRoot: string,
  mutate: (
    project: Project,
  ) => ProjectJsonMutation<T> | Promise<ProjectJsonMutation<T>>,
): Promise<T> {
  const projectPath = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const project = JSON.parse(await readFile(projectPath, "utf8")) as Project;
    const { result, shouldWrite = true } = await mutate(project);
    if (shouldWrite) {
      await atomicWriteFile(
        projectPath,
        JSON.stringify(project, null, 2),
        "utf8",
      );
    }
    return result;
  });
}
