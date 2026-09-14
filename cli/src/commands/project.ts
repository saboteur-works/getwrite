import type { Command } from "commander";
import {
  createProjectFromType,
  detectDocxSource,
  DocxDestinationNotEmptyError,
  importDocxProject,
  importScrivenerProject,
  NoDocxFilesFoundError,
  runForTenant,
  UnknownProjectTypeError,
  UnsupportedScrivenerProjectError,
  type ImportDocxProjectOptions,
} from "@gw/core";

/**
 * Valid `--split-level` string values (FR-9): `"none"`, or a single digit
 * `1`-`6`. Kept as a standalone union so {@link parseSplitLevelOption} can
 * report an invalid value distinctly from "not supplied".
 */
type SplitLevelOption = ImportDocxProjectOptions["splitLevel"];

/**
 * Parses and validates a `--split-level` CLI argument (FR-9) before any
 * write. Returns `undefined` for an invalid value (neither `"none"` nor an
 * integer `1`-`6`) so the caller can report a clear message and exit
 * non-zero without ever reaching the orchestrator.
 *
 * @param raw - The raw `--split-level` option value as typed on the CLI.
 * @returns The parsed {@link SplitLevelOption}, or `undefined` when invalid.
 */
function parseSplitLevelOption(raw: string): SplitLevelOption | undefined {
  if (raw === "none") return "none";
  if (/^[1-6]$/.test(raw)) {
    return Number(raw) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return undefined;
}

export default function registerProject(program: Command): void {
  const cmd = program
    .command("project")
    .description("Project related commands");

  cmd
    .command("create [projectRoot]")
    .description(
      "Create a new getwrite project from a project-type spec or JSON file",
    )
    .option(
      "-s, --spec <specPath>",
      "Path to project-type JSON spec (or object not supported on CLI)",
    )
    .option("-n, --name <name>", "Optional project name")
    .action(async (projectRoot = ".", options) => {
      try {
        if (!options?.spec) {
          console.error(
            "--spec <path> is required to create a project from a spec file",
          );
          process.exit(2);
        }

        const specPath = String(options.spec);

        const result = await runForTenant(projectRoot as string, () =>
          createProjectFromType({
            projectRoot: projectRoot as string,
            spec: specPath,
            name: options.name,
          }),
        );

        console.log(`Created project at: ${projectRoot}`);
        console.log(
          `Folders: ${result.folders.length}, Resources: ${result.resources.length}`,
        );
        process.exit(0);
      } catch (err) {
        console.error("Failed to create project:", err);
        process.exit(2);
      }
    });

  cmd
    .command("import-scrivener <scrivPath> [projectRoot]")
    .description(
      "Import a Scrivener 3 (Mac-authored) .scriv project into a new getwrite project",
    )
    .option("-n, --name <name>", "Optional destination project name")
    .action(async (scrivPath: string, projectRoot = ".", options) => {
      try {
        const result = await runForTenant(projectRoot, () =>
          importScrivenerProject({
            scrivPath,
            projectRoot,
            name: options?.name,
          }),
        );

        console.log(`Imported Scrivener project to: ${result.projectRoot}`);
        console.log(
          `Folders: ${result.folderCount}, Resources: ${result.resourceCount}, Tags: ${result.tagCount}`,
        );
        console.log(
          `Report written to: ${result.projectRoot}/scrivener-import-report.txt`,
        );
        process.exit(0);
      } catch (err) {
        if (err instanceof UnsupportedScrivenerProjectError) {
          console.error(err.message);
          process.exit(2);
        }
        console.error("Failed to import Scrivener project:", err);
        process.exit(2);
      }
    });

  cmd
    .command("import-docx <source> [projectRoot]")
    .description(
      "Import a Word document (.docx) or a folder of .docx documents into a new getwrite project",
    )
    .option("-n, --name <name>", "Optional destination project name")
    .option(
      "-s, --split-level <1-6|none>",
      "Heading level to split a single-file source at (default: 1); refused for a folder source",
    )
    .option(
      "-t, --project-type <id>",
      "Destination project-type spec id (default: blank)",
    )
    .action(async (source: string, projectRoot = ".", options) => {
      try {
        // FR-9: --split-level is validated before any write. Only parsed
        // when the writer actually passed it — the orchestrator's own
        // DEFAULT_SPLIT_LEVEL (1) applies when it is omitted, so an absent
        // flag is never itself invalid.
        let splitLevel: SplitLevelOption | undefined;
        if (options?.splitLevel !== undefined) {
          const parsed = parseSplitLevelOption(String(options.splitLevel));
          if (parsed === undefined) {
            console.error(
              `Invalid --split-level value "${options.splitLevel}": ` +
                `expected "none" or an integer from 1 to 6.`,
            );
            process.exit(2);
            return;
          }
          splitLevel = parsed;

          // FR-9: refused, before any write, against a folder source —
          // FR-3's per-file split does not use a heading level. Only
          // checked when --split-level was actually supplied, since the
          // orchestrator's own auto-detection (Task 3's detectDocxSource)
          // already handles the unqualified default case.
          const detected = await runForTenant(projectRoot, () =>
            detectDocxSource(source),
          );
          if (detected.kind === "directory") {
            console.error(
              "--split-level cannot be used with a folder source: " +
                "FR-3's per-file split does not use a heading level.",
            );
            process.exit(2);
            return;
          }
        }

        const result = await runForTenant(projectRoot, () =>
          importDocxProject({
            sourcePath: source,
            projectRoot,
            name: options?.name,
            splitLevel,
            projectType: options?.projectType,
          }),
        );

        console.log(`Imported DOCX project to: ${result.projectRoot}`);
        console.log(
          `Folders: ${result.folderCount}, Resources: ${result.resourceCount}`,
        );
        process.exit(0);
      } catch (err) {
        if (
          err instanceof UnknownProjectTypeError ||
          err instanceof DocxDestinationNotEmptyError ||
          err instanceof NoDocxFilesFoundError
        ) {
          console.error(err.message);
          process.exit(2);
          return;
        }
        console.error("Failed to import DOCX project:", err);
        process.exit(2);
      }
    });
}
