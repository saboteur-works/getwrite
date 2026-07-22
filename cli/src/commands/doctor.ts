/**
 * @module doctor
 *
 * Registers the `doctor` sub-command on the Commander program.
 *
 * Read-only integrity check for a project on disk. Today it flags broken
 * folder associations: resources (and folders) whose parent folder id does not
 * resolve to any existing folder descriptor. These are the orphans that the
 * resource tree silently re-parents to the root — the failure mode behind a
 * "lost" folder whose children resurface at the top level.
 *
 * Usage:
 * ```
 * getwrite-cli doctor [projectRoot]
 * ```
 *
 * Exit codes:
 * - `0`  — no problems found.
 * - `1`  — one or more integrity problems found.
 * - `2`  — unexpected error during the check (details logged to stderr).
 *
 * When the environment variable `GETWRITE_CLI_TESTING` is set, `process.exit`
 * is suppressed so the command can be exercised in tests without terminating
 * the process. The action resolves to the exit code in that case.
 */
import path from "node:path";
import { Command } from "commander";
import { readFolderTree, getLocalResources, runForTenant } from "@gw/core";

interface FolderLike {
  id?: unknown;
  name?: unknown;
  parentId?: unknown;
  folderId?: unknown;
}

/** Parent reference for a folder descriptor (folders may use either key). */
function folderParentId(folder: FolderLike): string | null | undefined {
  const parent = folder.parentId ?? folder.folderId;
  return typeof parent === "string" ? parent : (parent as null | undefined);
}

export async function runDoctor(root: string): Promise<number> {
  const folders = (await readFolderTree(
    path.join(root, "folders"),
  )) as FolderLike[];

  const folderIds = new Set<string>();
  for (const f of folders) {
    if (typeof f.id === "string") folderIds.add(f.id);
  }

  const problems: string[] = [];

  // Resources whose folderId points at a folder that no longer exists.
  for (const r of await getLocalResources(root)) {
    const fid = r.folderId;
    if (typeof fid === "string" && fid.length > 0 && !folderIds.has(fid)) {
      problems.push(
        `orphaned resource: "${r.name}" (${r.id}) -> missing folder ${fid}`,
      );
    }
  }

  // Folders whose parent points at a folder that no longer exists.
  for (const f of folders) {
    const parent = folderParentId(f);
    if (
      typeof parent === "string" &&
      parent.length > 0 &&
      !folderIds.has(parent)
    ) {
      const name = typeof f.name === "string" ? f.name : "(unnamed)";
      const id = typeof f.id === "string" ? f.id : "(no id)";
      problems.push(
        `orphaned folder: "${name}" (${id}) -> missing parent ${parent}`,
      );
    }
  }

  if (problems.length === 0) {
    console.log(`[doctor] OK — no broken folder associations in ${root}`);
    return 0;
  }

  console.error(`[doctor] Found ${problems.length} problem(s) in ${root}:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nThese items render at the project root because their parent folder is gone.\n" +
      "Recreate the missing folder (reusing its id) or move the items to an existing folder.",
  );
  return 1;
}

export function registerDoctor(program: Command) {
  program
    .command("doctor [projectRoot]")
    .description(
      "Check a project for broken folder associations (orphaned resources/folders)",
    )
    .action(async (projectRoot: string | undefined): Promise<void> => {
      const root = projectRoot ?? process.cwd();
      try {
        const code = await runForTenant(root, () => runDoctor(root));
        if (!process.env.GETWRITE_CLI_TESTING) process.exit(code);
      } catch (err) {
        console.error("Doctor command failed:", err);
        if (!process.env.GETWRITE_CLI_TESTING) process.exit(2);
      }
    });
}

export default registerDoctor;
