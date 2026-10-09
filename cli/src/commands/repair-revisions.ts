/**
 * @module repair-revisions
 *
 * Registers the `repair-revisions` sub-command on the Commander program.
 *
 * Gives every text resource that has content but no revision its initial
 * canonical revision. The editor autosaves only into a canonical revision, so
 * edits typed into such a resource are not saved until it has one.
 *
 * Usage:
 * ```
 * getwrite-cli repair-revisions [projectRoot] [--dry-run]
 * ```
 *
 * Exit codes:
 * - `0`  — nothing needed repair, or everything that did was repaired
 *          (with `--dry-run`: would be repaired).
 * - `1`  — at least one revision-less text resource could not be repaired.
 * - `2`  — unexpected error (details logged to stderr).
 * - `3`  — the project is encrypted, so it was not examined.
 *
 * When `GETWRITE_CLI_TESTING` is set, `process.exit` is suppressed.
 */
import { Command } from "commander";
import { repairMissingInitialRevisions, runForTenant } from "@gw/core";
import { guardAgainstEncryptedProject } from "../lib/encryption-guard";

const TAG = "[repair-revisions]";

export async function runRepairRevisions(
  root: string,
  opts: { dryRun?: boolean } = {},
): Promise<number> {
  const guardCode = await guardAgainstEncryptedProject(
    root,
    "repair-revisions",
    "It would write plaintext revisions into a sealed project.",
  );
  if (guardCode !== null) return guardCode;

  const report = await repairMissingInitialRevisions(root, opts);

  if (report.repaired.length === 0 && report.skipped.length === 0) {
    console.log(`${TAG} OK — every text resource in ${root} has a revision`);
    return 0;
  }

  if (report.repaired.length > 0) {
    const verb = opts.dryRun ? "Would repair" : "Repaired";
    console.log(
      `${TAG} ${verb} ${report.repaired.length} text resource(s) with no revision in ${root}:`,
    );
    for (const r of report.repaired) console.log(`  - "${r.name}" (${r.id})`);
  }

  if (report.skipped.length > 0) {
    console.error(
      `${TAG} Could not repair ${report.skipped.length} text resource(s):`,
    );
    for (const s of report.skipped) {
      console.error(`  - "${s.name}" (${s.id}): ${s.reason}`);
    }
    return 1;
  }
  return 0;
}

export function registerRepairRevisions(program: Command) {
  program
    .command("repair-revisions [projectRoot]")
    .description(
      "Give text resources that have no revision their initial canonical revision",
    )
    .option("--dry-run", "list what would be repaired without writing")
    .action(
      async (
        projectRoot: string | undefined,
        options: { dryRun?: boolean },
      ): Promise<void> => {
        const root = projectRoot ?? process.cwd();
        try {
          const code = await runForTenant(root, () =>
            runRepairRevisions(root, { dryRun: options.dryRun }),
          );
          if (!process.env.GETWRITE_CLI_TESTING) process.exit(code);
        } catch (err) {
          console.error("Repair-revisions command failed:", err);
          if (!process.env.GETWRITE_CLI_TESTING) process.exit(2);
        }
      },
    );
}

export default registerRepairRevisions;
