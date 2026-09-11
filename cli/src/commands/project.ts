import type { Command } from "commander";
import {
  createProjectFromType,
  importScrivenerProject,
  runForTenant,
  UnsupportedScrivenerProjectError,
} from "@gw/core";

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
}
