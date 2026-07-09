/**
 * @module reindex
 *
 * Registers the `reindex` sub-command on the Commander program.
 *
 * Rebuilds the inverted index and backlinks from scratch by scanning all
 * resources in a project root. Useful for recovering from index corruption
 * or after bulk filesystem changes that bypass the normal save flow.
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
import {
  listResourceIds,
  computeBacklinks,
  persistBacklinks,
  indexResource,
  readSidecar,
  loadResourceContent,
  runInStorageContext,
  getStorageAdapter,
  type TextResource,
} from "@gw/core";

export function registerReindex(program: Command) {
  program
    .command("reindex [projectRoot]")
    .description(
      "Rebuild the inverted index and backlinks for a project from scratch",
    )
    .action(async (projectRoot: string | undefined): Promise<void> => {
      const root = projectRoot ?? process.cwd();
      try {
        const ids = await runInStorageContext(
          { tenantRoot: root, adapter: getStorageAdapter() },
          async () => {
            const ids = await listResourceIds(root);
            const now = new Date().toISOString();

            for (const id of ids) {
              let name = id;
              try {
                const side = await readSidecar(root, id);
                if (side && (side as Record<string, unknown>).name) {
                  name = String((side as Record<string, unknown>).name);
                }
              } catch (_) {
                // no sidecar — use id as name
              }

              let plainText: string | undefined;
              try {
                const loaded = await loadResourceContent(root, id);
                plainText = loaded.plainText ?? undefined;
              } catch (_) {
                // no content — index will be empty for this resource
              }

              const minimal: TextResource = {
                id,
                name,
                type: "text",
                folderId: undefined,
                createdAt: now,
                plainText,
                tiptap: undefined,
              } as unknown as TextResource;

              await indexResource(root, minimal);
            }

            const backlinks = await computeBacklinks(root);
            await persistBacklinks(root, backlinks);

            return ids;
          },
        );

        console.log(
          `[reindex] Done — indexed ${ids.length} resource(s) in ${root}`,
        );

        if (!process.env.GETWRITE_CLI_TESTING) process.exit(0);
      } catch (err) {
        console.error("Reindex command failed:", err);
        if (!process.env.GETWRITE_CLI_TESTING) process.exit(2);
      }
    });
}

export default registerReindex;
