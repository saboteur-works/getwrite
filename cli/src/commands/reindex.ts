/**
 * @module reindex
 *
 * Registers the `reindex` sub-command on the Commander program.
 *
 * Rebuilds the inverted index, backlinks, and entity mention index from
 * scratch by scanning all resources in a project root. Useful for recovering
 * from index corruption or after bulk filesystem changes that bypass the
 * normal save flow.
 *
 * Usage:
 * ```
 * getwrite reindex [projectRoot]
 * ```
 *
 * Exit codes:
 * - `0`  — reindex completed successfully.
 * - `2`  — unexpected error during reindex (details logged to stderr).
 *
 * When the environment variable `GETWRITE_CLI_TESTING` is set, `process.exit`
 * is suppressed so the command can be exercised in tests without terminating
 * the process.
 */
import { Command } from "commander";
import { runForTenant, rebuildDerivedIndexes } from "@gw/core";
import { guardAgainstEncryptedProject } from "../lib/encryption-guard";

export function registerReindex(program: Command) {
  program
    .command("reindex [projectRoot]")
    .description(
      "Rebuild the inverted index and backlinks for a project from scratch",
    )
    .action(async (projectRoot: string | undefined): Promise<void> => {
      const root = projectRoot ?? process.cwd();
      try {
        // Check before any read. On an encrypted project every resource's
        // content/sidecar reads fail (or, per-resource, are swallowed by the
        // try/catch below), so this command would otherwise build an index
        // from empty data and overwrite the real inverted index, backlinks,
        // and mention index with it — destroying them before a later
        // uncaught failure aborts the command.
        const guardCode = await guardAgainstEncryptedProject(
          root,
          "reindex",
          "It would rebuild the inverted index, backlinks, and mention index " +
            "from what it can read, then overwrite the real ones on disk with " +
            "that (likely empty or garbage) result.",
        );
        if (guardCode !== null) {
          if (!process.env.GETWRITE_CLI_TESTING) process.exit(guardCode);
          return;
        }

        let mentionCount = 0;
        const ids = await runForTenant(root, async () => {
          const result = await rebuildDerivedIndexes(root);
          mentionCount = result.mentionCount;
          return result.resourceIds;
        });

        console.log(
          `[reindex] Done — indexed ${ids.length} resource(s), ${mentionCount} mention(s) in ${root}`,
        );

        if (!process.env.GETWRITE_CLI_TESTING) process.exit(0);
      } catch (err) {
        console.error("Reindex command failed:", err);
        if (!process.env.GETWRITE_CLI_TESTING) process.exit(2);
      }
    });
}

export default registerReindex;
