// Last Updated: 2026-11-01

/**
 * @module list-resource-ids-strict
 *
 * Failure-aware listing of the resource ids under `<projectRoot>/resources/`
 * (Feature 98, FR-17). The lenient `listResourceIds` in `backlinks.ts` returns
 * `[]` for every failure; this one returns `[]` only when the directory does
 * not exist, so a failed listing is never read as "no resources"
 * (`docs/standards/failure-visibility.md`).
 */
import path from "node:path";
import type { Dirent } from "node:fs";
import { readdir } from "./io";

/**
 * List the directory names under `<projectRoot>/resources/`.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Resource ids; `[]` only when `resources/` does not exist (`ENOENT`).
 * @throws Any other `readdir` error, including a locked-access error, unchanged.
 */
export async function listResourceIdsStrict(
  projectRoot: string,
): Promise<string[]> {
  const base = path.join(projectRoot, "resources");
  try {
    const entries = (await readdir(base, { withFileTypes: true })) as Dirent[];
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
