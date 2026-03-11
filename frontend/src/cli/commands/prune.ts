// Last Updated: 2026-03-11

/**
 * @module prune
 *
 * Registers the `prune` sub-command on the Commander program.
 *
 * The `prune` command removes stale revision snapshots that accumulate under a
 * project root directory, keeping only the most recent N copies of each
 * resource.  The actual pruning logic lives in {@link runCli} (pruneExecutor)
 * so that it can be exercised independently of the CLI entry point.
 *
 * Usage:
 * ```
 * getwrite prune [projectRoot] [--max <number>]
 * ```
 *
 * Examples:
 * ```sh
 * # Prune the project in the current directory, keeping 50 revisions (default)
 * getwrite prune
 *
 * # Prune a specific project root, keeping only the 10 most recent revisions
 * getwrite prune /path/to/my-project --max 10
 * ```
 *
 * Exit codes:
 * - `0`  — all resources pruned successfully.
 * - `2`  — unexpected error during pruning (details logged to stderr).
 *
 * When the environment variable `GETWRITE_CLI_TESTING` is set, `process.exit`
 * is suppressed so the command can be exercised in tests without terminating
 * the process.
 */
import { Command } from "commander";
import { runCli } from "../../lib/models/pruneExecutor";

/**
 * Registers the `prune` sub-command on the provided Commander `program`.
 *
 * The registered command has the following signature:
 * ```
 * prune [projectRoot] [--max <number>]
 * ```
 *
 * - `projectRoot` (optional positional) — absolute or relative path to the
 *   project root whose revisions should be pruned.  Defaults to `process.cwd()`
 *   when omitted.
 * - `--max` / `-m` (optional flag) — maximum number of revisions to retain per
 *   resource.  Defaults to `50`.
 *
 * Internally delegates all pruning work to {@link runCli}, passing it a
 * synthetic `argv`-style array so the executor can be shared with tests.
 *
 * @param program - The root Commander `Command` instance to attach the
 *   sub-command to.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerPrune } from "./commands/prune";
 *
 * const program = new Command();
 * registerPrune(program);
 * program.parse(process.argv);
 * ```
 */
export function registerPrune(program: Command) {
    program
        .command("prune [projectRoot]")
        .description("Prune old revisions under a project root")
        .option("-m, --max <number>", "maximum revisions to keep", "50")
        .action(
            async (
                projectRoot: string | undefined,
                options: { max: string },
            ): Promise<void> => {
                // Fall back to the working directory when no root is supplied.
                const root = projectRoot ?? process.cwd();
                const max = Number(options.max ?? 50);
                try {
                    const code = await runCli([
                        process.execPath,
                        "getwrite-cli",
                        root,
                        String(max),
                    ]);
                    // When running as a real CLI, exit with the returned code. When used
                    // programmatically (tests) set env GETWRITE_CLI_TESTING to avoid exit.
                    if (!process.env.GETWRITE_CLI_TESTING)
                        process.exit(code ?? 0);
                } catch (err) {
                    console.error("Prune command failed:", err);
                    if (!process.env.GETWRITE_CLI_TESTING) process.exit(2);
                }
            },
        );
}

export default registerPrune;
