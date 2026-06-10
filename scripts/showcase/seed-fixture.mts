/**
 * Seeds the showcase fixture from any valid GetWrite project on disk.
 *
 * Copies a project into `scripts/showcase/fixture/projects/` so that
 * `pnpm showcase` boots against it. Strips the per-project colorMode
 * preference so the runner's theme seeding controls light/dark output.
 *
 * Usage:
 *   node --experimental-strip-types scripts/showcase/seed-fixture.mts --project <path>
 *
 * <path> may be:
 *   - A UUID project directory  (e.g. projects/c02957ec-…)
 *   - A project.json file       (e.g. projects/c02957ec-…/project.json)
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECTS_DIR } from "./boot.mts";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { projectPath: string } {
  const args = argv.slice(2);
  let projectPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--project" || args[i] === "-p") && args[i + 1]) {
      projectPath = args[++i];
    }
  }

  if (!projectPath) {
    console.error("Usage: pnpm showcase:seed --project <path-to-project-dir-or-project.json>");
    process.exit(1);
  }

  return { projectPath };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ProjectJson {
  id: string;
  name: string;
  metadata?: { userPreferences?: { colorMode?: string; [k: string]: unknown }; [k: string]: unknown };
  [k: string]: unknown;
}

function readProjectJson(projectDir: string): ProjectJson {
  const jsonPath = path.join(projectDir, "project.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`No project.json found at ${jsonPath}`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as ProjectJson;
}

/** Strips colorMode from the copied project.json so theme seeding takes effect. */
function stripColorMode(projectDir: string): void {
  const jsonPath = path.join(projectDir, "project.json");
  const data: ProjectJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (data.metadata?.userPreferences?.colorMode !== undefined) {
    delete data.metadata.userPreferences.colorMode;
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log("[seed] Stripped metadata.userPreferences.colorMode from project.json");
  }
}

/** Reads all sidecar files and returns resource names sorted alphabetically. */
function listResourceNames(projectDir: string): string[] {
  const metaDir = path.join(projectDir, "meta");
  if (!fs.existsSync(metaDir)) return [];

  return fs
    .readdirSync(metaDir)
    .filter((f) => f.startsWith("resource-") && f.endsWith(".meta.json"))
    .map((f) => {
      try {
        const sidecar = JSON.parse(
          fs.readFileSync(path.join(metaDir, f), "utf8"),
        ) as { name?: string; type?: string };
        return sidecar.name ?? null;
      } catch {
        return null;
      }
    })
    .filter((n): n is string => n !== null)
    .sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function seed(): void {
  const { projectPath } = parseArgs(process.argv);

  // Resolve to the project directory regardless of whether they passed a file.
  const resolved = path.resolve(projectPath);
  const projectDir =
    fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? path.dirname(resolved)
      : resolved;

  if (!fs.existsSync(projectDir)) {
    console.error(`[seed] Path not found: ${projectDir}`);
    process.exit(1);
  }

  // Validate the source project.
  let project: ProjectJson;
  try {
    project = readProjectJson(projectDir);
  } catch (err) {
    console.error(`[seed] ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`[seed] Source project: "${project.name}" (${project.id})`);
  console.log(`[seed] Source path:    ${projectDir}`);

  // Clear the fixture projects directory.
  if (fs.existsSync(DEFAULT_PROJECTS_DIR)) {
    fs.rmSync(DEFAULT_PROJECTS_DIR, { recursive: true, force: true });
    console.log(`[seed] Cleared ${DEFAULT_PROJECTS_DIR}`);
  }
  fs.mkdirSync(DEFAULT_PROJECTS_DIR, { recursive: true });

  // Copy the project, excluding .trash.
  const destDir = path.join(DEFAULT_PROJECTS_DIR, path.basename(projectDir));
  fs.cpSync(projectDir, destDir, {
    recursive: true,
    filter: (src) => !src.includes("/.trash"),
  });
  console.log(`[seed] Copied to ${destDir}`);

  // Strip the per-project colorMode preference.
  stripColorMode(destDir);

  // Report what the user needs to wire up in scenes.mts.
  const resourceNames = listResourceNames(destDir);

  console.log(`
[seed] Done. Update scenes.mts to reference this project:

  projectName: "${project.name}"

  Available resource names (for openResource steps):
${resourceNames.map((n) => `    "${n}"`).join("\n")}
`);
}

seed();
